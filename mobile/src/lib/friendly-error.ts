import type { DictKey } from "./i18n";

/**
 * Map any thrown value onto a translation key a person can act on.
 *
 * Same rule as the web app (web/src/lib/friendly-error.ts), for the same
 * reasons — the most important being security. `duplicate key value violates
 * unique constraint "profiles_phone_key"` hands anyone probing the API the
 * table, the column and the constraint name; error text is an
 * information-disclosure surface, not just bad copy. It is also English-only
 * and describes the database's problem rather than the user's.
 *
 * Keep the two mappers in step: a rule added here belongs there too.
 */

/** Codes our own RPCs return in `{ ok: false, error }` — already opaque. */
const APP_CODES: Record<string, DictKey> = {
  auth: "errAuthRequired",
  admin: "errAdminOnly",
  rpc: "errGeneric",
  self: "errSelfTarget",
  self_demote: "errSelfTarget",
  not_found: "errNotFound",
  invalid_email: "errInvalidEmail",
  email_taken: "errEmailTaken",
  unchanged: "errEmailUnchanged",
  already_pending: "errRequestPending",
  already_reviewed: "errAlreadyReviewed",
  phone_taken: "errPhoneTaken",
  rate_limited: "errRateLimited",
};

/** PostgREST / Postgres SQLSTATE → message. */
const CODES: Record<string, DictKey> = {
  "23502": "errInvalidInput", // not-null violation
  "23503": "errInvalidInput", // foreign key violation
  "23514": "errInvalidInput", // check violation (refined below)
  "23505": "errDuplicate", // unique violation (refined below)
  "42501": "errPermission", // insufficient privilege / RLS
  "42883": "errUnavailable", // function does not exist
  "42P01": "errUnavailable", // relation does not exist
  "22P02": "errInvalidInput", // invalid input syntax
  "P0001": "errGeneric", // raise_exception from a trigger
  PGRST116: "errNotFound",
  PGRST202: "errUnavailable",
  PGRST204: "errUnavailable",
  PGRST205: "errUnavailable",
  PGRST301: "errAuthRequired",
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

/** Which message fits this failure. */
export function errorKey(err: unknown, fallback: DictKey = "errGeneric"): DictKey {
  const { text, code, status } = raw(err);
  const s = text.toLowerCase();

  const appByCode = code ? APP_CODES[code] : undefined;
  if (appByCode) return appByCode;
  const appByText = s ? APP_CODES[s.trim()] : undefined;
  if (appByText) return appByText;

  // Worth naming precisely — "that already exists" is useless when the user has
  // no idea *what* already exists.
  if (code === "23505" || /duplicate key|already exists|unique constraint/.test(s)) {
    if (/phone/.test(s)) return "errPhoneTaken";
    if (/email/.test(s)) return "errEmailTaken";
    return "errDuplicate";
  }
  // Our self-dealing CHECK constraints are all named *_no_self_*.
  if (code === "23514" || /violates check constraint/.test(s)) {
    if (/no_self|self_offer|self_review|self_report/.test(s)) return "errSelfAction";
    return "errInvalidInput";
  }
  if (/row-level security|violates row level security/.test(s)) return "errPermission";

  const byCode = code ? CODES[code] : undefined;
  if (byCode) return byCode;

  if (
    /network request failed|failed to fetch|load failed|networkerror|offline|timed? ?out|aborted/.test(
      s,
    )
  ) {
    return "errNetwork";
  }
  if (/invalid login credentials|invalid email or password/.test(s)) return "errBadCredentials";
  if (/token has expired|invalid token|token is invalid|otp expired|invalid or has expired/.test(s)) {
    return "errBadCode";
  }
  if (/email not confirmed|confirm your email/.test(s)) return "errEmailNotConfirmed";
  if (/password should be at least|password is too short|weak password/.test(s)) {
    return "errWeakPassword";
  }
  if (/already registered|already been registered|user already exists/.test(s)) {
    return "errEmailTaken";
  }
  if (status === 429 || /rate limit|too many requests|only request this after/.test(s)) {
    return "errRateLimited";
  }
  if (status === 413 || /payload too large|maximum allowed size|file too large/.test(s)) {
    return "errTooLarge";
  }
  if (status === 401 || /jwt|not authenticated/.test(s)) return "errAuthRequired";
  if (status === 403 || /no api key|permission denied/.test(s)) return "errPermission";
  if (status === 404 || /not found|does not exist|no rows/.test(s)) return "errNotFound";
  if (status >= 500 || /internal server error|service unavailable|bad gateway/.test(s)) {
    return "errServerBusy";
  }

  return fallback;
}

/** Keep the real text reachable in dev without ever rendering it. */
export function logRawError(err: unknown) {
  if (__DEV__ && err) console.error("[handled error]", err);
}

/**
 * A ready-to-render message. For screens that show errors inline rather than
 * through the toast provider (the auth screen keeps its own `error` state, so
 * the message survives while the form stays open).
 *
 * Replaces an older `friendlyError` in lib/api.ts that returned hardcoded
 * English and, failing to recognise an error, printed the first 120 characters
 * of the raw Postgres message — untranslated, and exactly the schema leak this
 * module exists to prevent.
 */
export function friendlyError(
  err: unknown,
  t: (key: DictKey) => string,
  fallback: DictKey = "errGeneric",
): string {
  logRawError(err);
  return t(errorKey(err, fallback));
}
