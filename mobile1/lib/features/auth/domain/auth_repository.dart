import '../../../core/models/models.dart';

/// Contract for authentication operations.
abstract class AuthRepository {
  Future<({bool ok, String? error})> signInWithEmail(String email, String password);

  Future<({bool ok, String? error, bool needsConfirmation})> signUpWithEmail(String email, String password, {String? fullName});

  Future<({bool ok, String? error})> verifyEmailOtp(String email, String token);

  Future<({bool ok, String? error})> resendConfirmation(String email);

  Future<({bool ok, String? error})> requestPasswordReset(String email);

  Future<({bool ok, String? error})> verifyPasswordResetOtp(String email, String token);

  Future<({bool ok, String? error})> updatePassword(String newPassword);

  Future<({bool ok, String? error})> signInWithGoogle();

  Future<void> signOut();

  Future<Profile?> currentProfile();

  String? get userId;
}
