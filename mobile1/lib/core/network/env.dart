/// Build-time configuration.
///
/// Passed via `--dart-define` at run/build time:
///   flutter run --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=... --dart-define=GOOGLE_WEB_CLIENT_ID=...
class Env {
  Env._();

  static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const String supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  /// Web Client ID from Google Cloud Console — required for native Google
  /// Sign-In via `signInWithIdToken`.
  static const String googleWebClientId = String.fromEnvironment('GOOGLE_WEB_CLIENT_ID');

  /// Optional iOS Client ID (only needed when building for iOS).
  static const String googleIosClientId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');

  /// Telegram bot username (without the leading @) that powers the
  /// account-linking deep link (`t.me/<bot>?start=<token>`). When empty the
  /// Telegram connect UI is hidden, matching mobile1's `telegramConfigured()`.
  static const String telegramBotUsername = String.fromEnvironment('TELEGRAM_BOT_USERNAME');

  static bool get isConfigured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;

  static bool get telegramConfigured => telegramBotUsername.isNotEmpty;
}
