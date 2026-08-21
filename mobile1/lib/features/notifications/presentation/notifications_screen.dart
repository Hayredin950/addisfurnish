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
import '../../../core/widgets/section_header.dart';
import '../domain/notifications_repository.dart';

/// In-app notification center (bell → notifications).
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> with AppStateMixin {
  NotificationsRepository get _repo => sl<NotificationsRepository>();

  List<AppNotification>? _notifications;
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

  Future<void> _load() async {
    final uid = AppState.instance.userId;
    if (uid == null) {
      setState(() {
        _loading = false;
        _notifications = const [];
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final notifications = await _repo.getNotifications(uid);
      if (!mounted) return;
      setState(() {
        _notifications = notifications;
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

  void _subscribe() {
    final uid = AppState.instance.userId;
    if (uid == null) return;
    _channel?.unsubscribe();
    _channel = AppSupabase.client
        .channel('notifications-$uid')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'notifications',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'user_id',
            value: uid,
          ),
          callback: (_) => _load(),
        )
        .subscribe();
  }

  Future<void> _markAllRead() async {
    final uid = AppState.instance.userId;
    if (uid == null) return;
    await _repo.markAllRead(uid);
    _load();
  }

  Future<void> _onTap(AppNotification n) async {
    if (!n.isRead) {
      await _repo.markRead(n.id);
      _load();
    }
    if (n.listingId != null && mounted) {
      Routes.listingById(context, n.listingId!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final notifications = _notifications ?? const <AppNotification>[];

    return Scaffold(
      appBar: AppBar(
        title: Text(state.t('notif.title')),
        actions: [
          if (notifications.any((n) => !n.isRead))
            TextButton(
              onPressed: _markAllRead,
              child: Text(state.t('notif.markRead')),
            ),
        ],
      ),
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
              : notifications.isEmpty
                  ? EmptyState(
                      icon: Icons.notifications_none,
                      title: state.t('notif.empty'),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        itemCount: notifications.length,
                        separatorBuilder: (_, _) => const Divider(indent: 72),
                        itemBuilder: (context, i) {
                          final n = notifications[i];
                          return ListTile(
                            leading: Icon(
                              _iconFor(n.type),
                              color: n.isRead
                                  ? Theme.of(context).colorScheme.outline
                                  : Theme.of(context).colorScheme.primary,
                            ),
                            title: Text(
                              _titleFor(state, n),
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                    fontWeight: n.isRead ? FontWeight.w400 : FontWeight.w600,
                                  ),
                            ),
                            subtitle: Text(Fmt.timeAgo(n.createdAt)),
                            onTap: () => _onTap(n),
                          );
                        },
                      ),
                    ),
    );
  }

  IconData _iconFor(String type) {
    switch (type) {
      case 'new_message':
        return Icons.chat_bubble_outline;
      case 'callback_request':
        return Icons.phone_in_talk_outlined;
      case 'listing_sold':
        return Icons.check_circle_outline;
      case 'price_drop':
        return Icons.trending_down;
      case 'saved_search_match':
        return Icons.search;
      case 'callback_response':
        return Icons.call_outlined;
      case 'seller_verified':
        return Icons.verified_outlined;
      case 'seller_rejected':
        return Icons.error_outline;
      default:
        return Icons.notifications_none;
    }
  }

  String _titleFor(AppState state, AppNotification n) {
    switch (n.type) {
      case 'new_message':
        return n.title != null
            ? state.t('notif.newMessage', {'title': n.title!})
            : n.title ?? '';
      case 'price_drop':
        return state.t('notif.priceDrop', {
          'title': n.title ?? '',
          'price': Fmt.birr(n.newPrice),
        });
      case 'saved_search_match':
        return state.t('notif.savedSearchMatch', {
          'query': n.query ?? '',
          'title': n.title ?? '',
        });
      case 'seller_verified':
        return state.t('notif.sellerVerified');
      case 'seller_rejected':
        return state.t('notif.sellerRejected');
      default:
        return n.title ?? n.type;
    }
  }
}
