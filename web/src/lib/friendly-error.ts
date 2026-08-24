import type { TKey, Translate } from "./i18n";

/**
 * Turn any thrown value into a message a person can act on.
 *
 * Nothing that reaches a user should be raw Postgres, GoTrue, Storage or HTTP
 * text. Three reasons, in order of importance:
 *
 *   1. Security. `duplicate key value violates unique constraint
 *      "profiles_phone_key"` hands a prober the table, the column and the
 *      constraint name for free. Error text is an information-disclosure
 *      surface, not just bad copy.
 *   2. It is always English, so half the audience cannot read it at all.
 *   3. It describes the database's problem, not the user's, and says nothing
 *      about what to do next.
 *
 * The raw value is still logged to the console in dev, so debugging does not
 * get harder — see `logRaw` below.
 */

/** Codes our own RPCs return in `{ ok: false, error }` — already opaque. */
const APP_CODES: Record<string, TKey> = {
  auth: "err.authRequired",
  admin: "err.adminOnly",
  not_found: "err.notFound",
  invalid_email: "err.invalidEmail",
  email_taken: "err.emailTaken",
  unchanged: "err.emailUnchanged",
  already_pending: "err.requestPending",
  already_reviewed: "err.alreadyReviewed",
  phone_taken: "err.phoneTaken",
  rate_limited: "err.rateLimited",
  self: "err.selfTarget",
  self_demote: "err.selfTarget",
  // A server function that failed at the transport layer and deliberately
  // withheld the driver text (see lib/admin.ts).
  rpc: "err.generic",
};

/** PostgREST / Postgres SQLSTATE → message. */
const CODES: Record<string, TKey> = {
  // Postgres
  "23502": "err.invalidInput", // not-null violation
  "23503": "err.invalidInput", // foreign key violation
  "23514": "err.invalidInput", // check violation (refined below)
  "23505": "err.duplicate", // unique violation (refined below)
  "42501": "err.permission", // insufficient privilege / RLS
  "42883": "err.unavailable", // function does not exist
  "42P01": "err.unavailable", // relation does not exist
  "22P02": "err.invalidInput", // invalid input syntax
  P0001: "err.generic", // raise_exception from a trigger
  // PostgREST
  PGRST116: "err.notFound",
  PGRST202: "err.unavailable",
  PGRST204: "err.unavailable",
  PGRST205: "err.unavailable",
  PGRST301: "err.authRequired",
};

type ErrLike = {
  code?: unknown;
  message?: unknown;
  error_description?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
  error?: unknown;
};

function raw(err: unknown): { text: string; code: string; status: number } {
  if (typeof err === "string") return { text: err, code: err, status: 0 };
  if (!err || typeof err !== "object") return { text: "", code: "", status: 0 };
  const e = err as ErrLike;
  const parts = [e.message, e.error_description, e.details, e.hint, e.error].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  return {
    text: parts.join(" | "),
    code: typeof e.code === "string" ? e.code : "",
    status: typeof e.status === "number" ? e.status : 0,
  };
}

/** Which message fits this failure. Exported for tests and for non-toast UI. */
export function errorKey(err: unknown, fallback: TKey = "err.generic"): TKey {
  const { text, code, status } = raw(err);
  const s = text.toLowerCase();

  // Read once into a local: with noUncheckedIndexedAccess a second lookup is
  // typed `TKey | undefined` even after the guard.
  const appByCode = code ? APP_CODES[code] : undefined;
  if (appByCode) return appByCode;
  const appByText = s ? APP_CODES[s.trim()] : undefined;
  if (appByText) return appByText;

  // Unique violations are worth naming precisely — "that already exists" is
  // useless when the user has no idea *what* already exists.
  if (code === "23505" || /duplicate key|already exists|unique constraint/.test(s)) {
    if (/phone/.test(s)) return "err.phoneTaken";
    if (/email/.test(s)) return "err.emailTaken";
    return "err.duplicate";
  }
  // Our self-dealing CHECK constraints are all named *_no_self_*.
  if (code === "23514" || /violates check constraint/.test(s)) {
    if (/no_self|self_offer|self_review|self_report/.test(s)) return "err.selfAction";
    return "err.invalidInput";
  }
  if (/row-level security|violates row level security/.test(s)) {
    // An RLS refusal on a self-dealing table is the business rule firing, not
    // a genuine permissions problem.
    if (/report|offer|review/.test(s)) return "err.permission";
    return "err.permission";
  }

  const byCode = code ? CODES[code] : undefined;
  if (byCode) return byCode;

  if (
    /network request failed|failed to fetch|load failed|networkerror|err_internet|offline|timed? ?out/.test(
      s,
    )
  ) {
    return "err.network";
  }
  if (/invalid login credentials|invalid email or password/.test(s)) return "err.badCredentials";
  if (
    /token has expired|invalid token|token is invalid|otp expired|invalid or has expired/.test(s)
  ) {
    return "err.badCode";
  }
  if (/email not confirmed|confirm your email/.test(s)) return "err.emailNotConfirmed";
  if (/password should be at least|password is too short|weak password/.test(s)) {
    return "err.weakPassword";
  }
  if (/already registered|already been registered|user already exists/.test(s)) {
    return "err.emailTaken";
  }
  if (status === 429 || /rate limit|too many requests|only request this after/.test(s)) {
    return "err.rateLimited";
  }
  if (status === 413 || /payload too large|maximum allowed size|file too large/.test(s)) {
    return "err.tooLarge";
  }
  if (
    status === 401 ||
    status === 403 ||
    /jwt|not authenticated|no api key|permission denied/.test(s)
  ) {
    return status === 401 || /jwt|not authenticated/.test(s)
      ? "err.authRequired"
      : "err.permission";
  }
  if (status === 404 || /not found|does not exist|no rows/.test(s)) return "err.notFound";
  if (status >= 500 || /internal server error|service unavailable|bad gateway/.test(s)) {
    return "err.serverBusy";
  }

  return fallback;
}

/** Keep the real text reachable for debugging without ever rendering it. */
function logRaw(err: unknown) {
  if (import.meta.env.DEV && err) console.error("[handled error]", err);
}

/**
 * The one call sites should use: `toast.error(friendlyError(err, t))`.
 * `fallback` lets a caller pick a more specific catch-all ("Couldn't publish
 * your listing") for failures this mapper doesn't recognise.
 */
export function friendlyError(err: unknown, t: Translate, fallback: TKey = "err.generic"): string {
  logRaw(err);
  return t(errorKey(err, fallback));
}
