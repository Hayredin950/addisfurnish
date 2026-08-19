import '../../../core/models/models.dart';

/// Contract for the messages feature.
abstract class MessagesRepository {
  Future<List<Conversation>> getConversations(String userId);

  Future<String> ensureConversation(String listingId, String buyerId, String sellerId);

  Future<List<Message>> getMessages(String conversationId);

  Future<void> sendMessage(String conversationId, String senderId, String body);

  Future<void> editMessage(String messageId, String body);

  Future<void> deleteMessage(String messageId);

  Future<void> deleteConversation(String conversationId, String myUserId);

  Future<void> markConversationRead(String conversationId, String myUserId);
}
