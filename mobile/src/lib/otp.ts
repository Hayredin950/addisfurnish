import { supabase } from "./supabase";

/**
 * Phone-number verification via the Telegram bot — mobile mirror of
 * web/src/lib/otp.ts.
 *
 * No SMS involved: the user shares their contact with the bot's
 * request_contact button, the bot checks the shared number really belongs to
 * that Telegram account, and only then DMs a one-time code. This module just
 * mints the deep-link token and checks the code — the `verify_phone_otp` RPC
 * is SECURITY DEFINER, so an authenticated client can run it without touching
 * the server-only phone_otps table (web reads that table with the service
 * role; mobile can't).
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

export type PhoneVerifyStart = { ok: true; url: string } | { ok: false; error: string };

/** Mints a single-use token and returns the t.me deep link for the bot. */
export async function startPhoneVerification(phone: string): Promise<PhoneVerifyStart> {
  const username = process.env.EXPO_PUBLIC_TELEGRAM_BOT_USERNAME;
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, error: "invalid_phone" };
  if (!username) return { ok: false, error: "not_configured" };

  const { data: token, error } = await supabase.rpc("mint_phone_verify_token", {
    _phone: normalized,
  });
  if (error) return { ok: false, error: "server_error" };
  // NULL means the number is already on another account (or failed the RPC's
  // own format check — format already passed above).
  if (!token) return { ok: false, error: "taken" };

  return { ok: true, url: `https://t.me/${username.replace(/^@/, "")}?start=${token}` };
}

/** Checks the code the bot sent; on success the profile gets phone_verified_at. */
export async function verifyPhoneOtp(phone: string, code: string): Promise<OtpResult> {
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, error: "invalid_phone" };
  const { data, error } = await supabase.rpc("verify_phone_otp", {
    _phone: normalized,
    _code: code.trim(),
  });
  if (error) return { ok: false, error: "server_error" };
  return data === "ok" ? { ok: true } : { ok: false, error: (data as string) ?? "server_error" };
}
