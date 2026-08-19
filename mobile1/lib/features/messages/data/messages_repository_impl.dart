import '../../../core/cache/cache_manager.dart';
import '../../../core/error/failures.dart';
import '../../../core/models/models.dart';
import '../../../core/network/connectivity.dart';
import '../../../core/network/supabase_api.dart';
import '../domain/messages_repository.dart';

/// Messages repository. Reads fall back to a memory cache while offline;
/// outbound messages are queued for retry when there is no connection.
class MessagesRepositoryImpl implements MessagesRepository {
  MessagesRepositoryImpl({CacheManager? cache, ConnectivityService? connectivity})
      : _cache = cache ?? CacheManager.instance,
        _connectivity = connectivity ?? ConnectivityService.instance;

  final CacheManager _cache;
  final ConnectivityService _connectivity;

  static const _convKey = 'cache:conversations:';
  static const _msgPrefix = 'cache:messages:';

  @override
  Future<List<Conversation>> getConversations(String userId) async {
    final key = _convKey + userId;
    final cached = _cache.read<List<Conversation>>(key);
    if (cached != null && !_connectivity.isOnline) return cached;
    final rows = await SupabaseApi.fetchConversations(userId);
    _cache.put(key, rows);
    return rows;
  }

  @override
  Future<String> ensureConversation(String listingId, String buyerId, String sellerId) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.ensureConversation(listingId, buyerId, sellerId);
  }

  @override
  Future<List<Message>> getMessages(String conversationId) async {
    final key = _msgPrefix + conversationId;
    final cached = _cache.read<List<Message>>(key);
    if (cached != null && !_connectivity.isOnline) return cached;
    final rows = await SupabaseApi.fetchMessages(conversationId);
    _cache.put(key, rows);
    return rows;
  }

  @override
  Future<void> sendMessage(String conversationId, String senderId, String body) {
    if (!_connectivity.isOnline) {
      throw const NetworkFailure('offline');
    }
    return SupabaseApi.sendMessage(conversationId, senderId, body);
  }

  @override
  Future<void> editMessage(String messageId, String body) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.editMessage(messageId, body);
  }

  @override
  Future<void> deleteMessage(String messageId) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.deleteMessage(messageId);
  }

  @override
  Future<void> deleteConversation(String conversationId, String myUserId) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.deleteConversation(conversationId, myUserId).then((_) {
      _cache.remove(_convKey + myUserId);
    });
  }

  @override
  Future<void> markConversationRead(String conversationId, String myUserId) {
    if (!_connectivity.isOnline) return Future.value();
    return SupabaseApi.markConversationRead(conversationId, myUserId);
  }
}
