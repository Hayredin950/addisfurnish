import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/navigation/routes.dart';
import '../../../core/network/supabase_client.dart';
import '../../../core/models/models.dart';
import '../../../core/utils/format.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../../../core/widgets/app_image.dart';
import '../../../core/widgets/section_header.dart';
import '../domain/messages_repository.dart';

/// Conversation list with a realtime bump when a new message arrives.
class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> with AppStateMixin {
  MessagesRepository get _repo => sl<MessagesRepository>();

  List<Conversation>? _conversations;
  bool _loading = true;
  String? _error;
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    _load();
    _subscribe();
  }

  @override
  void dispose() {
    _channel?.unsubscribe();
    super.dispose();
  }

  String? get _userId => AppState.instance.userId;

  Future<void> _load() async {
    final uid = _userId;
    if (uid == null) {
      setState(() {
        _loading = false;
        _conversations = const [];
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final convos = await _repo.getConversations(uid);
      if (!mounted) return;
      setState(() {
        _conversations = convos;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$e';
      });
    }
  }

  Future<void> _deleteConversation(Conversation c) async {
    final uid = _userId;
    if (uid == null) return;
    try {
      await _repo.deleteConversation(c.id, uid);
      if (!mounted) return;
      setState(() {
        _conversations = _conversations?.where((x) => x.id != c.id).toList();
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      _load();
    }
  }

  Future<bool?> _confirmDelete(Conversation c) {
    final state = AppState.instance;
    return showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(state.t('msg.deleteTitle')),
        content: Text(state.t('msg.deleteBody')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(state.t('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            child: Text(state.t('common.delete')),
          ),
        ],
      ),
    );
  }

  void _subscribe() {
    final uid = _userId;
    if (uid == null) return;
    _channel?.unsubscribe();
    // The message trigger bumps conversations.last_message_at, so watching the
    // conversations table covers new conversations and new messages alike.
    _channel = AppSupabase.client
        .channel('messages-list-$uid')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'conversations',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'buyer_id',
            value: uid,
          ),
          callback: (_) => _load(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'conversations',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'seller_id',
            value: uid,
          ),
          callback: (_) => _load(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'conversations',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'buyer_id',
            value: uid,
          ),
          callback: (_) => _load(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'conversations',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'seller_id',
            value: uid,
          ),
          callback: (_) => _load(),
        )
        .subscribe();
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final theme = Theme.of(context);
    final conversations = _conversations ?? const <Conversation>[];

    return Scaffold(
      appBar: AppBar(title: Text(state.t('tabs.messages'))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!),
                      const SizedBox(height: 12),
                      FilledButton(onPressed: _load, child: Text(state.t('common.retry'))),
                    ],
                  ),
                )
              : conversations.isEmpty
                  ? EmptyState(
                      icon: Icons.chat_bubble_outline,
                      title: state.t('msg.noConversations'),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        itemCount: conversations.length,
                        separatorBuilder: (_, _) => const Divider(indent: 76),
                        itemBuilder: (context, i) {
                          final c = conversations[i];
                          return Dismissible(
                            key: ValueKey(c.id),
                            direction: DismissDirection.endToStart,
                            background: Container(
                              alignment: Alignment.centerRight,
                              padding: const EdgeInsets.only(right: 20),
                              color: theme.colorScheme.errorContainer,
                              child: Icon(
                                Icons.delete_outline,
                                color: theme.colorScheme.onErrorContainer,
                              ),
                            ),
                            confirmDismiss: (_) => _confirmDelete(c),
                            onDismissed: (_) => _deleteConversation(c),
                            child: _ConversationTile(
                              conversation: c,
                              onTap: () async {
                                await Routes.chat(
                                  context,
                                  conversationId: c.id,
                                  otherName:
                                      c.otherParty?.displayName ?? 'Chat',
                                  listingTitle: c.listingTitle,
                                );
                                if (mounted) _load();
                              },
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.conversation, this.onTap});

  final Conversation conversation;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final other = conversation.otherParty;
    final name = other?.displayName ?? 'Chat';

    return ListTile(
      leading: SizedBox(
        width: 48,
        height: 48,
        child: Stack(
          children: [
            ClipOval(
              child: AppImage(
                other?.photoUrl,
                width: 48,
                height: 48,
                icon: Icons.person_outline,
              ),
            ),
            if (other?.isOnline == true)
              Positioned(
                right: 0,
                bottom: 0,
                child: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary,
                    shape: BoxShape.circle,
                    border: Border.all(color: theme.colorScheme.surface, width: 2),
                  ),
                ),
              ),
          ],
        ),
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: conversation.unread > 0 ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
          if (conversation.unread > 0) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '${conversation.unread}',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ],
      ),
      subtitle: Text(
        conversation.listingTitle != null
            ? '${conversation.listingTitle} · ${Fmt.timeAgoShort(conversation.lastMessageAt)}'
            : Fmt.timeAgoShort(conversation.lastMessageAt),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      onTap: onTap,
    );
  }
}
