import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/network/supabase_client.dart';
import '../../../core/models/models.dart';
import '../../../core/utils/format.dart';
import '../../../core/state/app_state.dart';
import '../../../core/widgets/section_header.dart';
import '../domain/messages_repository.dart';

/// 1:1 chat with the other party on a listing. Live realtime delivery,
/// edit/delete for own messages.
class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.conversationId,
    required this.otherName,
    this.listingTitle,
  });

  final String conversationId;
  final String otherName;
  final String? listingTitle;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  MessagesRepository get _repo => sl<MessagesRepository>();

  final _controller = TextEditingController();
  List<Message>? _messages;
  bool _loading = true;
  String? _error;
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    _load();
    _subscribe();
    _markRead();
  }

  @override
  void dispose() {
    _controller.dispose();
    _channel?.unsubscribe();
    super.dispose();
  }

  Future<void> _markRead() {
    final uid = AppState.instance.userId;
    if (uid == null) return Future.value();
    return _repo.markConversationRead(widget.conversationId, uid);
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final messages = await _repo.getMessages(widget.conversationId);
      if (!mounted) return;
      setState(() {
        _messages = messages;
        _loading = false;
      });
      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$e';
      });
    }
  }

  void _subscribe() {
    _channel = AppSupabase.client
        .channel('chat-${widget.conversationId}')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'messages',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'conversation_id',
            value: widget.conversationId,
          ),
          callback: (_) => _load(),
        )
        .subscribe();
  }

  final _scrollController = ScrollController();

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    final uid = AppState.instance.userId;
    if (uid == null) return;
    _controller.clear();
    await _repo.sendMessage(widget.conversationId, uid, text);
  }

  Future<void> _editMessage(Message m) async {
    final state = AppState.instance;
    final controller = TextEditingController(text: m.body);
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(state.t('msg.edit')),
        content: TextField(
          controller: controller,
          autofocus: true,
          minLines: 1,
          maxLines: 4,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(state.t('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(state.t('common.save')),
          ),
        ],
      ),
    );
    if (saved != true) return;
    final body = controller.text.trim();
    if (body.isEmpty || body == m.body) return;
    try {
      await _repo.editMessage(m.id, body);
      _load();
    } catch (e) {
      if (mounted) _snack('$e');
    }
  }

  Future<void> _deleteMessage(Message m) async {
    final state = AppState.instance;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(state.t('msg.deleteMessageTitle')),
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
    if (confirmed != true) return;
    try {
      await _repo.deleteMessage(m.id);
      _load();
    } catch (e) {
      if (mounted) _snack('$e');
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final theme = Theme.of(context);
    final messages = _messages ?? const <Message>[];

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.otherName),
            if (widget.listingTitle != null)
              Text(
                widget.listingTitle!,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
              ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
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
                    : messages.isEmpty
                        ? EmptyState(
                            icon: Icons.chat_bubble_outline,
                            title: state.t('msg.noConversations'),
                          )
                        : ListView.builder(
                            controller: _scrollController,
                            padding: const EdgeInsets.all(16),
                            itemCount: messages.length,
                            itemBuilder: (context, i) {
                              final m = messages[i];
                              return _MessageBubble(
                                message: m,
                                onEdit: m.senderId == state.userId ? () => _editMessage(m) : null,
                                onDelete:
                                    m.senderId == state.userId ? () => _deleteMessage(m) : null,
                              );
                            },
                          ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        hintText: state.t('msg.write'),
                        contentPadding:
                            const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _send,
                    icon: const Icon(Icons.send),
                    tooltip: state.t('msg.send'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, this.onEdit, this.onDelete});

  final Message message;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final mine = message.senderId == AppState.instance.userId;
    final deleted = message.deletedAt != null;
    final actions = <({IconData icon, String label, VoidCallback onTap})>[
      if (onEdit != null)
        (icon: Icons.edit_outlined, label: 'Edit', onTap: onEdit!),
      if (onDelete != null)
        (icon: Icons.delete_outline, label: 'Delete', onTap: onDelete!),
    ];

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: actions.isEmpty
            ? null
            : () {
                showModalBottomSheet<void>(
                  context: context,
                  builder: (context) => SafeArea(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (final a in actions)
                          ListTile(
                            leading: Icon(a.icon),
                            title: Text(
                              a.label,
                              style: theme.textTheme.bodyLarge?.copyWith(
                                color: a.label == 'Delete' ? theme.colorScheme.error : null,
                              ),
                            ),
                            onTap: () {
                              Navigator.pop(context);
                              a.onTap();
                            },
                          ),
                      ],
                    ),
                  ),
                );
              },
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
          decoration: BoxDecoration(
            color: mine
                ? theme.colorScheme.primary
                : theme.colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(16),
              topRight: const Radius.circular(16),
              bottomLeft: Radius.circular(mine ? 16 : 4),
              bottomRight: Radius.circular(mine ? 4 : 16),
            ),
          ),
          child: deleted
              ? Text(
                  '${AppState.instance.t('msg.deleted')} (${Fmt.timeAgoShort(message.createdAt)})',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: mine
                        ? theme.colorScheme.onPrimary.withValues(alpha: 0.8)
                        : theme.colorScheme.outline,
                    fontStyle: FontStyle.italic,
                  ),
                )
              : Column(
                  crossAxisAlignment: mine
                      ? CrossAxisAlignment.end
                      : CrossAxisAlignment.start,
                  children: [
                    Text(
                      message.body,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: mine
                            ? theme.colorScheme.onPrimary
                            : theme.colorScheme.onSurface,
                      ),
                    ),
                    if (message.editedAt != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        'edited',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: mine
                              ? theme.colorScheme.onPrimary.withValues(alpha: 0.7)
                              : theme.colorScheme.outline,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ],
                )
          ),
      ),
    );
  }
}
