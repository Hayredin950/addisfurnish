import '../../../core/cache/cache_manager.dart';
import '../../../core/models/models.dart';
import '../../../core/network/connectivity.dart';
import '../../../core/network/supabase_api.dart';
import '../domain/notifications_repository.dart';

/// Notifications repository with a small in-memory cache + offline fallback.
class NotificationsRepositoryImpl implements NotificationsRepository {
  NotificationsRepositoryImpl({CacheManager? cache, ConnectivityService? connectivity})
      : _cache = cache ?? CacheManager.instance,
        _connectivity = connectivity ?? ConnectivityService.instance;

  final CacheManager _cache;
  final ConnectivityService _connectivity;

  static const _key = 'cache:notifications:';

  @override
  Future<List<AppNotification>> getNotifications(String userId, {int limit = 50}) async {
    final key = _key + userId;
    final cached = _cache.read<List<AppNotification>>(key);
    if (cached != null && !_connectivity.isOnline) return cached;
    final rows = await SupabaseApi.fetchNotifications(userId, limit: limit);
    _cache.put(key, rows);
    return rows;
  }

  @override
  Future<void> markAllRead(String userId) {
    if (!_connectivity.isOnline) return Future.value();
    return SupabaseApi.markNotificationsRead(userId);
  }

  @override
  Future<void> markRead(String id) {
    if (!_connectivity.isOnline) return Future.value();
    return SupabaseApi.markNotificationRead(id);
  }

  @override
  Future<void> notifyUser(String userId, String type, Map<String, dynamic> payload) {
    if (!_connectivity.isOnline) return Future.value();
    return SupabaseApi.notifyUser(userId, type, payload);
  }
}
