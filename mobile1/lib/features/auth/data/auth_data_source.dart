import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/network/supabase_api.dart';
import '../../../core/network/supabase_client.dart';

/// Auth helpers. Phone OTP uses the `otp-auth` edge function (service-role
/// flow mirroring the web app's server functions); email/password and Google
/// use native Supabase auth.
class AuthDataSource {
  AuthDataSource._();

  /// Normalises an auth error into a short, UI-safe message.
  static String errorOf(Object e) {
    if (e is AuthException) {
      return e.message.toLowerCase().contains('invalid') ? 'invalid_credentials' : e.message;
    }
    return '$e';
  }

  static String? get currentUserId => AppSupabase.client.auth.currentUser?.id;

  // ── Email / password ──────────────────────────────────────────────────

  static Future<AuthResponse> signInWithEmail(String email, String password) {
    return AppSupabase.client.auth.signInWithPassword(email: email, password: password);
  }

  static Future<AuthResponse> signUpWithEmail(String email, String password, {String? fullName}) {
    return AppSupabase.client.auth.signUp(
      email: email,
      password: password,
      data: fullName != null && fullName.trim().isNotEmpty ? {'full_name': fullName.trim()} : null,
    );
  }

  static Future<AuthResponse> verifyEmailOtp(String email, String token) {
    return AppSupabase.client.auth.verifyOTP(
      email: email,
      token: token,
      type: OtpType.signup,
    );
  }

  static Future<void> resendConfirmation(String email) {
    return AppSupabase.client.auth.resend(
      type: OtpType.signup,
      email: email,
    );
  }

  static Future<void> requestPasswordReset(String email) {
    return AppSupabase.client.auth.resetPasswordForEmail(email);
  }

  static Future<AuthResponse> verifyResetOtp(String email, String token) {
    return AppSupabase.client.auth.verifyOTP(
      email: email,
      token: token,
      type: OtpType.recovery,
    );
  }

  static Future<void> updatePassword(String newPassword) {
    return AppSupabase.client.auth.updateUser(UserAttributes(password: newPassword));
  }

  // ── Google Sign-In (browser-based OAuth, same as mobile1) ─────────────
  // Uses Supabase's `signInWithOAuth` to get the authorization URL, then
  // opens it in the device browser. After the user authenticates, the browser
  // redirects back to the app via the `addisfurnish://` deep link scheme.
  // Supabase Flutter's `appLinks` config automatically captures the tokens
  // from the redirect URL and establishes the session.

  /// The custom URL scheme configured in AndroidManifest.xml and used by
  /// Supabase to redirect back after OAuth.
  static const _redirectScheme = 'addisfurnish';
  static const _redirectTo = '$_redirectScheme://auth';

  static Future<void> signInWithGoogle() async {
    AppSupabase.client.auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: _redirectTo,
      authScreenLaunchMode: LaunchMode.externalApplication,
    );

    // signInWithOAuth with LaunchMode.externalApplication opens the browser
    // automatically. The session is captured by supabase_flutter's deep link
    // handler when the browser redirects back to addisfurnish://auth.
    //
    // We don't need to manually parse the URL or set the session — 
    // supabase_flutter handles it via the auth state change listener.

    debugPrint('[Auth] Google OAuth flow initiated (browser redirect)');
  }

  // ── Session / profile ─────────────────────────────────────────────────

  static Future<void> refreshProfile(String userId) =>
      SupabaseApi.fetchProfile(userId).then((_) {});

  static Future<void> signOut() => AppSupabase.client.auth.signOut();
}
