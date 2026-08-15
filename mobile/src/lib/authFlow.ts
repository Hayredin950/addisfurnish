/**
 * Lets the auth screen tell the root layout's route guard to hold off while a
 * password-reset flow is mid-flight on /auth.
 *
 * verifyOtp (type "recovery") establishes a session as soon as the user enters
 * the emailed code, and the layout's useProtectedRoute would otherwise bounce
 * them straight into the app before they can set a new password.
 *
 * A plain module-level flag (rather than context) is enough: the guard only
 * reacts to auth state changes while the user is on the auth screen, and the
 * auth screen syncs this flag on every resetStep change.
 */
export const authFlow = {
  holdRedirect: false,
};
