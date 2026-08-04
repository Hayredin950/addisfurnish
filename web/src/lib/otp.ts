import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Phone-number OTP verification (spec §6).
 *
 * Production: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER
 * env vars and codes are delivered by SMS. Without them the server runs in
 * "dev mode": the code is returned in the response so you can type it in.
 */

export type OtpResult =
  { ok: true; dev?: boolean; devCode?: string } | { ok: false; error: string };

/** Normalizes an Ethiopian phone number (09…, 7…, +251…) to +251 format, or null. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9 && /^[79]/.test(digits)) return `+251${digits}`;
  if (digits.length === 10 && digits.startsWith("0") && /^09|^07/.test(digits))
    return `+251${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("251")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("251")) return `+${digits}`;
  return null;
}

async function currentUserId(): Promise<string | null> {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/** Best-effort client IP for per-IP rate limiting. */
function getClientIp(): string | null {
  const request = getRequest();
  const fwd = request?.headers?.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return request?.headers?.get("x-real-ip") ?? null;
}

async function sendSms(to: string, body: string): Promise<boolean> {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_PHONE_NUMBER"];
  if (!sid || !token || !from) return false;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const sendPhoneOtp = createServerFn({ method: "POST" })
  .validator((d: { phone: string }) => d)
  .handler(async ({ data }): Promise<OtpResult> => {
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: "auth" };

    const phone = normalizePhone(data.phone);
    if (!phone) return { ok: false, error: "invalid_phone" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Rate limit: one code per phone per minute.
    const { data: recent } = await supabaseAdmin
      .from("phone_otps")
      .select("id")
      .eq("phone", phone)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString())
      .limit(1);
    if (recent && recent.length > 0) return { ok: false, error: "rate_limited" };

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    // Keep only the latest code per user+phone.
    await supabaseAdmin.from("phone_otps").delete().eq("user_id", userId).eq("phone", phone);
    const { error } = await supabaseAdmin.from("phone_otps").insert({
      user_id: userId,
      phone,
      code,
      expires_at: expiresAt,
    });
    if (error) return { ok: false, error: "server_error" };

    const delivered = await sendSms(
      phone,
      `AddisFurnish verification code: ${code}. Valid for 10 minutes. Do not share it.`,
    );

    if (delivered) return { ok: true };
    // Dev fallback — no SMS provider configured.
    console.log(`[AddisFurnish OTP dev mode] ${phone} → ${code}`);
    return { ok: true, dev: true, devCode: code };
  });

export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .validator((d: { phone: string; code: string }) => d)
  .handler(async ({ data }): Promise<OtpResult> => {
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: "auth" };

    const phone = normalizePhone(data.phone);
    if (!phone) return { ok: false, error: "invalid_phone" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("phone_otps")
      .select("id,code,attempts,expires_at")
      .eq("user_id", userId)
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return { ok: false, error: "no_code" };
    if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: "expired" };
    if (row.attempts >= 5) return { ok: false, error: "too_many" };

    if (row.code !== data.code.trim()) {
      await supabaseAdmin
        .from("phone_otps")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      return { ok: false, error: "wrong_code" };
    }

    // Success: verify the phone on the profile and remember it as the contact.
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ phone_verified_at: new Date().toISOString(), phone })
      .eq("id", userId);
    if (error) return { ok: false, error: "server_error" };
    await supabaseAdmin.from("phone_otps").delete().eq("user_id", userId).eq("phone", phone);
    return { ok: true };
  });

// ── Passwordless registration & login (spec §3) ───────────────────────────
//
// Flow:  phone → requestAuthOtp() → SMS/dev code → verifyAuthOtp() returns a
// one-time password → client signs in with signInWithPassword({ phone,
// password }) → rotateAuthPassword() invalidates the one-time password.
// Phone is the primary identifier; a new user is created automatically on
// first verification (one account, no separate buyer/seller signup).

export const requestAuthOtp = createServerFn({ method: "POST" })
  .validator((d: { phone: string }) => d)
  .handler(async ({ data }): Promise<OtpResult> => {
    const phone = normalizePhone(data.phone);
    if (!phone) return { ok: false, error: "invalid_phone" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ip = getClientIp();
    const since = new Date(Date.now() - 10 * 60_000).toISOString();

    // Rate limit: max 3 codes per phone per 10 minutes (SMS costs money).
    const { count: phoneCount } = await supabaseAdmin
      .from("phone_otps")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .eq("purpose", "auth")
      .gte("created_at", since);
    if ((phoneCount ?? 0) >= 3) return { ok: false, error: "rate_limited" };

    // Per-IP limit (slightly looser — NAT/shared connections).
    if (ip) {
      const { count: ipCount } = await supabaseAdmin
        .from("phone_otps")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", ip)
        .eq("purpose", "auth")
        .gte("created_at", since);
      if ((ipCount ?? 0) >= 5) return { ok: false, error: "rate_limited" };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const { error } = await supabaseAdmin.from("phone_otps").insert({
      user_id: null,
      phone,
      code,
      purpose: "auth",
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(), // 5-min expiry
      ip_address: ip,
    });
    if (error) return { ok: false, error: "server_error" };

    const delivered = await sendSms(
      phone,
      `AddisFurnish login code: ${code}. Valid for 5 minutes. Do not share it.`,
    );
    if (delivered) return { ok: true };
    // Dev fallback — no SMS provider configured.
    console.log(`[AddisFurnish OTP dev mode] ${phone} → ${code}`);
    return { ok: true, dev: true, devCode: code };
  });

export type AuthOtpResult =
  { ok: true; phone: string; password: string; isNew: boolean } | { ok: false; error: string };

export const verifyAuthOtp = createServerFn({ method: "POST" })
  .validator((d: { phone: string; code: string }) => d)
  .handler(async ({ data }): Promise<AuthOtpResult> => {
    const phone = normalizePhone(data.phone);
    if (!phone) return { ok: false, error: "invalid_phone" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("phone_otps")
      .select("id,code,attempts,expires_at")
      .eq("phone", phone)
      .eq("purpose", "auth")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return { ok: false, error: "no_code" };
    if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: "expired" };
    if (row.attempts >= 5) return { ok: false, error: "too_many" };
    if (row.code !== data.code.trim()) {
      await supabaseAdmin
        .from("phone_otps")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      return { ok: false, error: "wrong_code" };
    }
    await supabaseAdmin.from("phone_otps").delete().eq("id", row.id);

    // Map the phone to an existing account, or create one (buyer by default).
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();

    const oneTime = crypto.randomUUID().replace(/-/g, "");
    let userId: string | null = null;
    let isNew = false;

    if (existing?.id) {
      userId = existing.id;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        phone,
        phone_confirm: true,
        password: oneTime,
      });
      if (error) return { ok: false, error: "server_error" };
      await supabaseAdmin
        .from("profiles")
        .update({ phone_verified_at: new Date().toISOString() })
        .eq("id", userId);
    } else {
      isNew = true;
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        phone,
        phone_confirm: true,
        password: oneTime,
        user_metadata: { phone },
      });
      if (error || !created?.user?.id) {
        // Duplicate (concurrent registration) → the account now exists;
        // link it like an existing user so the caller still gets in.
        const { data: retry } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("phone", phone)
          .limit(1)
          .maybeSingle();
        if (retry?.id) {
          isNew = false;
          userId = retry.id;
          const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            phone,
            phone_confirm: true,
            password: oneTime,
          });
          if (upErr) return { ok: false, error: "server_error" };
        } else {
          return { ok: false, error: "server_error" };
        }
      } else {
        userId = created.user.id;
        // handle_new_user() created the profile; attach the phone to it.
        await supabaseAdmin
          .from("profiles")
          .update({ phone, phone_verified_at: new Date().toISOString() })
          .eq("id", userId);
      }
    }
    if (!userId) return { ok: false, error: "server_error" };
    return { ok: true, phone, password: oneTime, isNew };
  });

/**
 * Invalidates the one-time password after the client has used it to sign in,
 * so a code can never be replayed. Caller must be the account owner.
 */
export const rotateAuthPassword = createServerFn({ method: "POST" })
  .validator((d: { phone: string }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const userId = await currentUserId();
    if (!userId) return { ok: false };
    const phone = normalizePhone(data.phone);
    if (!phone) return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (!profile || profile.id !== userId) return { ok: false };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: crypto.randomUUID().replace(/-/g, ""),
    });
    return { ok: !error };
  });
