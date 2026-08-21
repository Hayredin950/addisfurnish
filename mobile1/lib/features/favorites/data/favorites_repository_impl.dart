import '../../../core/cache/cache_manager.dart';
import '../../../core/error/failures.dart';
import '../../../core/models/models.dart';
import '../../../core/network/connectivity.dart';
import '../../../core/network/supabase_api.dart';
import '../domain/favorites_repository.dart';

/// Favorites repository with an in-memory cache for the id list (used by the
/// listing detail heart) and offline-tolerant reads.
class FavoritesRepositoryImpl implements FavoritesRepository {
  FavoritesRepositoryImpl({CacheManager? cache, ConnectivityService? connectivity})
      : _cache = cache ?? CacheManager.instance,
        _connectivity = connectivity ?? ConnectivityService.instance;

  final CacheManager _cache;
  final ConnectivityService _connectivity;

  static const _idsKey = 'cache:favorite_ids:';

  @override
  Future<List<String>> getFavoriteIds(String userId) async {
    final key = _idsKey + userId;
    final cached = _cache.read<List<String>>(key);
    if (cached != null) return cached;
    if (!_connectivity.isOnline) throw const NetworkFailure();
    final ids = await SupabaseApi.fetchFavoriteIds(userId);
    _cache.put(key, ids);
    return ids;
  }

  @override
  Future<List<Listing>> getFavorites(String userId) async {
    if (!_connectivity.isOnline) return const [];
    final list = await SupabaseApi.fetchFavorites(userId);
    // Keep ids in sync with the fetched rows.
    _cache.put(_idsKey + userId, list.map((l) => l.id).toList());
    return list;
  }

  @override
  Future<bool> toggle(String userId, String listingId, bool currentlySaved) async {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    await SupabaseApi.toggleFavorite(userId, listingId, currentlySaved);
    // Mutate the local id cache so the heart updates instantly.
    final key = _idsKey + userId;
    final ids = List<String>.from(_cache.read<List<String>>(key) ?? const []);
    if (currentlySaved) {
      ids.remove(listingId);
    } else {
      ids.add(listingId);
    }
    _cache.put(key, ids);
    return !currentlySaved;
  }
}
