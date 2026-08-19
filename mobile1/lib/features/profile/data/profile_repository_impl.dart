import 'dart:async';

import 'package:image_picker/image_picker.dart';

import '../../../core/cache/cache_manager.dart';
import '../../../core/error/failures.dart';
import '../../../core/models/models.dart';
import '../../../core/network/connectivity.dart';
import '../../../core/network/supabase_api.dart';
import '../domain/profile_repository.dart';

/// Profile repository with a cached profile read (stale-while-revalidate).
class ProfileRepositoryImpl implements ProfileRepository {
  ProfileRepositoryImpl({CacheManager? cache, ConnectivityService? connectivity})
      : _cache = cache ?? CacheManager.instance,
        _connectivity = connectivity ?? ConnectivityService.instance;

  final CacheManager _cache;
  final ConnectivityService _connectivity;

  static const _key = 'cache:profile:';

  @override
  Future<Profile?> getProfile(String userId) async {
    final key = _key + userId;
    final cached = _cache.read<Profile>(key);
    if (cached != null) {
      if (!_connectivity.isOnline) return cached;
      unawaited(SupabaseApi.fetchProfile(userId).then((fresh) {
        if (fresh != null) _cache.put(key, fresh);
      }).catchError((_) {}));
      return cached;
    }
    if (!_connectivity.isOnline) throw const NetworkFailure();
    final fresh = await SupabaseApi.fetchProfile(userId);
    if (fresh != null) _cache.put(key, fresh);
    return fresh;
  }

  @override
  Future<void> updateProfile(String userId, Map<String, dynamic> patch) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    _cache.remove(_key + userId);
    return SupabaseApi.updateProfile(userId, patch);
  }

  @override
  Future<void> markOnline() => SupabaseApi.markOnline();

  @override
  Future<void> markOffline() => SupabaseApi.markOffline();

  @override
  Future<String> uploadProfileImage(String userId, XFile file) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.uploadProfileImage(userId, file);
  }

  @override
  String profileImageUrl(String path) => SupabaseApi.profileImageUrl(path);

  @override
  Future<bool> isAdmin(String userId) => SupabaseApi.isAdmin(userId);

  @override
  Future<List<SavedSearch>> getSavedSearches(String userId) {
    if (!_connectivity.isOnline) return Future.value(const []);
    return SupabaseApi.fetchSavedSearches(userId);
  }

  @override
  Future<void> saveSearch(String userId, {String? query, String? category, double? min, double? max}) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.saveSearch(userId, query: query, category: category, min: min, max: max);
  }

  @override
  Future<void> deleteSavedSearch(String id) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.deleteSavedSearch(id);
  }

  @override
  Future<BuyerPreferences> getBuyerPreferences(String userId) {
    if (!_connectivity.isOnline) return Future.value(const BuyerPreferences());
    return SupabaseApi.fetchBuyerPreferences(userId);
  }

  @override
  Future<void> saveBuyerPreferences(String userId, BuyerPreferences prefs) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.saveBuyerPreferences(userId, prefs);
  }

  @override
  Future<List<VerificationDocument>> getVerificationDocs(String userId) {
    if (!_connectivity.isOnline) return Future.value(const []);
    return SupabaseApi.fetchMyVerificationDocs(userId);
  }

  @override
  Future<void> submitVerificationDocument(String sellerId, String type, String fileUrl) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.submitVerificationDocument(sellerId, type, fileUrl);
  }

  @override
  Future<String?> telegramConnectUrl() {
    if (!_connectivity.isOnline) return Future.value(null);
    return SupabaseApi.telegramConnectUrl();
  }

  @override
  Future<bool> disconnectTelegram() {
    if (!_connectivity.isOnline) return Future.value(false);
    return SupabaseApi.disconnectTelegram();
  }
}
