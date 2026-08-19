import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/models.dart';
import '../network/supabase_api.dart';
import '../network/supabase_client.dart';
import '../utils/i18n.dart' as i18n;
import '../di/service_locator.dart';
import '../../features/profile/domain/profile_repository.dart';

/// App-wide state: Supabase session, the user's profile row and the active
/// language (EN/አማርኛ). Replaces the web app's AuthProvider + LangProvider.
class AppState extends ChangeNotifier {
  AppState._();

  static final AppState instance = AppState._();

  bool _loading = true;
  User? _user;
  Session? _session;
  Profile? _profile;
  String _lang = 'en';
  bool _isAdmin = false;
  StreamSubscription<AuthState>? _authSub;
  Timer? _onlineBeat;

  bool get loading => _loading;
  User? get user => _user;
  Session? get session => _session;
  Profile? get profile => _profile;
  String get lang => _lang;
  String? get userId => _user?.id;

  bool get isSignedIn => _user != null;
  bool get isSeller => _profile?.isSeller ?? false;
  bool get isVerified => _profile?.verified ?? false;
  bool get isAdmin => _isAdmin;

  /// Initialises Supabase (if configured) and wires the auth listener.
  Future<void> init() async {
    await AppSupabase.initialize();
    if (!AppSupabase.isConfigured) {
      _loading = false;
      notifyListeners();
      return;
    }

    _authSub = AppSupabase.client.auth.onAuthStateChange.listen(
      (state) {
        _session = state.session;
        _user = state.session?.user;
        _handleAuthChange();
      },
      onError: (Object e, StackTrace s) {
        // Surface deep-link auth errors (e.g. PKCE code exchange failures) that
        // supabase_flutter otherwise swallows; temporary diagnostic hook.
        debugPrint('AUTH_ERROR: $e');
        debugPrint('AUTH_STACK: $s');
      },
    );

    final initial = AppSupabase.client.auth.currentSession;
    _session = initial;
    _user = initial?.user;
    _handleAuthChange();

    final prefs = await SharedPreferences.getInstance();
    _lang = prefs.getString('addisfurnish-lang') ?? 'en';
    _loading = false;
    notifyListeners();
  }

  Future<void> _handleAuthChange() async {
    final id = _user?.id;
    if (id == null) {
      _profile = null;
      _isAdmin = false;
      _stopOnlineBeat();
      notifyListeners();
      return;
    }
    // Also adopt the account's preferred language once (per session).
    try {
      final p = await SupabaseApi.fetchProfile(id);
      _profile = p;
      if (p != null && p.preferredLanguage.isNotEmpty) {
        await setLang(p.preferredLanguage, persist: false);
      }
      _isAdmin = await sl<ProfileRepository>().isAdmin(id);
      _startOnlineBeat();
    } catch (e) {
      debugPrint('load profile failed: $e');
      _profile = null;
      _isAdmin = false;
    }
    notifyListeners();
  }

  void _startOnlineBeat() {
    _stopOnlineBeat();
    SupabaseApi.markOnline();
    _onlineBeat = Timer.periodic(const Duration(minutes: 1), (_) => SupabaseApi.markOnline());
  }

  void _stopOnlineBeat() {
    _onlineBeat?.cancel();
    _onlineBeat = null;
  }

  Future<void> signOut() async {
    SupabaseApi.markOffline();
    _stopOnlineBeat();
    await AppSupabase.client.auth.signOut();
    _session = null;
    _user = null;
    _profile = null;
    notifyListeners();
  }

  Future<void> refreshProfile() async {
    final id = _user?.id;
    if (id == null) return;
    _profile = await SupabaseApi.fetchProfile(id);
    notifyListeners();
  }

  Future<void> setLang(String lang, {bool persist = true}) async {
    if (_lang == lang) return;
    _lang = lang;
    notifyListeners();
    if (persist) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('addisfurnish-lang', lang);
    }
  }

  /// Persists the language choice on the account too, so it syncs with the
  /// web app.
  Future<void> saveLangPreference() async {
    final id = _user?.id;
    if (id == null) return;
    await SupabaseApi.updateProfile(id, {'preferred_language': _lang});
    if (_profile != null) {
      _profile = Profile.fromJson({..._profile!.toJson(), 'preferred_language': _lang});
    }
    notifyListeners();
  }

  String t(String key, [Map<String, Object>? args]) {
    return i18n.I18n.t(_lang, key, args);
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _stopOnlineBeat();
    super.dispose();
  }
}
