import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Phone-number verification.
 *
 * Codes are delivered by the Telegram bot, not SMS: the user shares their
 * contact with Telegram's request_contact button, the bot checks the shared
 * number really belongs to that Telegram account, and only then issues a code
 * (see supabase/functions/telegram-bot/index.ts). That keeps verification free
 * and proves one number maps to one account — an SMS gateway would cost per
 * message and prove nothing about who actually received the code.
 *
 * This module therefore only mints the deep-link token and checks the code the
 * bot sent. Nothing here sends anything.
 */

export type OtpResult = { ok: true } | { ok: false; error: string };

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

export type PhoneVerifyStart = { ok: true; url: string } | { ok: false; error: string };

/**
 * Starts phone verification: mints a single-use token carrying the number
 * being verified and returns the t.me deep link that hands it to the bot.
 *
 * Reports `taken` when the number is already on another account, so the user
 * finds out before walking through the bot flow rather than from a unique
 * violation at the end of it.
 */
export const startPhoneVerification = createServerFn({ method: "POST" })
  .validator((d: { phone: string }) => d)
  .handler(async ({ data }): Promise<PhoneVerifyStart> => {
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: "auth" };

    const phone = normalizePhone(data.phone);
    if (!phone) return { ok: false, error: "invalid_phone" };

    const username = process.env["TELEGRAM_BOT_USERNAME"] ?? "";
    if (!username) return { ok: false, error: "not_configured" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: token, error } = await supabaseAdmin.rpc("mint_phone_verify_token", {
      _phone: phone,
    });
    if (error) return { ok: false, error: "server_error" };
    // The RPC returns null both for a taken number and for one that fails its
    // own format check; format already passed above, so this means taken.
    if (!token) return { ok: false, error: "taken" };

    return { ok: true, url: `https://t.me/${username.replace(/^@/, "")}?start=${token}` };
  });

/**
 * Checks the code the bot sent. On success the number becomes the profile's
 * verified contact number.
 */
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
    // The partial unique index on profiles(phone) is the last line of defence
    // if the number was claimed between minting the token and arriving here.
    if (error) {
      return { ok: false, error: error.code === "23505" ? "taken" : "server_error" };
    }
    await supabaseAdmin.from("phone_otps").delete().eq("user_id", userId).eq("phone", phone);
    return { ok: true };
  });
