import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'env.dart';

/// Shared Supabase client. Requires `--dart-define` credentials; the app shows
/// a friendly message when they are missing.
class AppSupabase {
  AppSupabase._();

  static SupabaseClient? _client;

  static Future<void> initialize() async {
    if (!Env.isConfigured) return;
    await Supabase.initialize(
      url: Env.supabaseUrl,
      publishableKey: Env.supabaseAnonKey,
      debug: true,
      httpClient: _DebugHttpClient(),
      authOptions: const FlutterAuthClientOptions(
        // Implicit flow: tokens come back in the URL fragment (#access_token=…)
        // which matches how mobile1 (React Native) handles Google OAuth.
        authFlowType: AuthFlowType.implicit,
      ),
    );
    _client = Supabase.instance.client;
  }

  static SupabaseClient get client {
    final c = _client;
    if (c == null) {
      throw StateError(
        'Supabase is not configured. Run with '
        '--dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...',
      );
    }
    return c;
  }

  static bool get isConfigured => _client != null;
}

/// Temporary diagnostic HTTP client: logs every Supabase request and enforces
/// a hard timeout so a hung call can never spin silently.
class _DebugHttpClient extends http.BaseClient {
  final http.Client _inner = http.Client();

  static const _timeout = Duration(seconds: 30);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final stopwatch = Stopwatch()..start();
    final logLine = StringBuffer()
      ..write('SUPABASE_HTTP ${request.method} ${request.url}');
    if (request is http.Request && request.body.isNotEmpty) {
      logLine.write(' BODY=${request.body}');
    }
    debugPrint(logLine.toString());
    try {
      final response = await _inner.send(request).timeout(_timeout);
      debugPrint('SUPABASE_HTTP -> ${response.statusCode} '
          'in ${stopwatch.elapsedMilliseconds}ms');
      return response;
    } catch (e) {
      debugPrint(
          'SUPABASE_HTTP -> ERROR ${e.runtimeType} in '
          '${stopwatch.elapsedMilliseconds}ms');
      rethrow;
    }
  }
}
