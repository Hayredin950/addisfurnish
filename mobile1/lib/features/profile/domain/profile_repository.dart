import 'package:image_picker/image_picker.dart';

import '../../../core/models/models.dart';

/// Contract for profile/account operations.
abstract class ProfileRepository {
  Future<Profile?> getProfile(String userId);

  Future<void> updateProfile(String userId, Map<String, dynamic> patch);

  Future<void> markOnline();

  Future<void> markOffline();

  Future<String> uploadProfileImage(String userId, XFile file);

  String profileImageUrl(String path);

  Future<bool> isAdmin(String userId);

  Future<List<SavedSearch>> getSavedSearches(String userId);

  Future<void> saveSearch(String userId, {String? query, String? category, double? min, double? max});

  Future<void> deleteSavedSearch(String id);

  Future<BuyerPreferences> getBuyerPreferences(String userId);

  Future<void> saveBuyerPreferences(String userId, BuyerPreferences prefs);

  Future<List<VerificationDocument>> getVerificationDocs(String userId);

  Future<void> submitVerificationDocument(String sellerId, String type, String fileUrl);

  /// Mints a single-use Telegram link token and returns the `t.me/<bot>?start=`
  /// deep link the user opens to bind their chat to the account.
  Future<String?> telegramConnectUrl();

  /// Disconnects Telegram from the app side (`unlink_telegram` RPC).
  Future<bool> disconnectTelegram();
}
