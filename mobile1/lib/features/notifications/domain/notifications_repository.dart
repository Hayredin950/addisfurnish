import '../../../core/models/models.dart';

/// Contract for the notifications feature.
abstract class NotificationsRepository {
  Future<List<AppNotification>> getNotifications(String userId, {int limit = 50});

  Future<void> markAllRead(String userId);

  Future<void> markRead(String id);

  Future<void> notifyUser(String userId, String type, Map<String, dynamic> payload);
}
