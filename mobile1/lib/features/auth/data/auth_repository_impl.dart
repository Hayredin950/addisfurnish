import '../../../core/models/models.dart';
import '../../../core/network/supabase_api.dart';
import '../domain/auth_repository.dart';
import 'auth_data_source.dart';

/// Auth repository. Auth has no cacheable read path, but we normalise errors
/// into a stable record shape for the UI.
class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl();

  @override
  Future<({bool ok, String? error})> signInWithEmail(String email, String password) async {
    try {
      await AuthDataSource.signInWithEmail(email, password);
      return (ok: true, error: null);
    } catch (e) {
      return (ok: false, error: AuthDataSource.errorOf(e));
    }
  }

  @override
  Future<({bool ok, String? error, bool needsConfirmation})> signUpWithEmail(String email, String password, {String? fullName}) async {
    try {
      final res = await AuthDataSource.signUpWithEmail(email, password, fullName: fullName);
      return (ok: true, error: null, needsConfirmation: res.session == null);
    } catch (e) {
      return (ok: false, error: AuthDataSource.errorOf(e), needsConfirmation: false);
    }
  }

  @override
  Future<({bool ok, String? error})> verifyEmailOtp(String email, String token) async {
    try {
      final res = await AuthDataSource.verifyEmailOtp(email, token);
      if (res.session != null) return (ok: true, error: null);
      return (ok: false, error: 'Verification failed');
    } catch (e) {
      return (ok: false, error: AuthDataSource.errorOf(e));
    }
  }

  @override
  Future<({bool ok, String? error})> resendConfirmation(String email) async {
    try {
      await AuthDataSource.resendConfirmation(email);
      return (ok: true, error: null);
    } catch (e) {
      return (ok: false, error: AuthDataSource.errorOf(e));
    }
  }

  @override
  Future<({bool ok, String? error})> requestPasswordReset(String email) async {
    try {
      await AuthDataSource.requestPasswordReset(email);
      return (ok: true, error: null);
    } catch (e) {
      return (ok: false, error: AuthDataSource.errorOf(e));
    }
  }

  @override
  Future<({bool ok, String? error})> verifyPasswordResetOtp(String email, String token) async {
    try {
      final res = await AuthDataSource.verifyResetOtp(email, token);
      if (res.session != null) return (ok: true, error: null);
      return (ok: false, error: 'Verification failed');
    } catch (e) {
      return (ok: false, error: AuthDataSource.errorOf(e));
    }
  }

  @override
  Future<({bool ok, String? error})> updatePassword(String newPassword) async {
    try {
      await AuthDataSource.updatePassword(newPassword);
      return (ok: true, error: null);
    } catch (e) {
      return (ok: false, error: AuthDataSource.errorOf(e));
    }
  }

  @override
  Future<({bool ok, String? error})> signInWithGoogle() async {
    try {
      await AuthDataSource.signInWithGoogle();
      return (ok: true, error: null);
    } catch (e) {
      final msg = '$e';
      return (ok: false, error: msg == 'cancelled' ? 'cancelled' : AuthDataSource.errorOf(e));
    }
  }

  @override
  Future<void> signOut() => AuthDataSource.signOut();

  @override
  Future<Profile?> currentProfile() {
    final uid = userId;
    if (uid == null) return Future.value(null);
    return SupabaseApi.fetchProfile(uid);
  }

  @override
  String? get userId => AuthDataSource.currentUserId;
}
