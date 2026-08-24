import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/models.dart';
import '../network/supabase_api.dart';
import '../network/supabase_client.dart';

/// Push + in-app notification lifecycle, mirroring the RN app's
/// `mobile/src/lib/notifications.ts` + `_layout.tsx`:
///
///  * Registers this device's FCM token against the account on sign-in and
///    removes it on sign-out (so a logged-out device stops receiving pushes).
///  * Subscribes to realtime INSERTs on `notifications` and raises a local
///    notification banner while the app is foregrounded (the backend delivers
///    background pushes through the send-push edge function / Expo).
///  * Routes the user when a notification is tapped — to the listing when the
///    payload carries a `listingId`, otherwise to the notification center.
///
/// Every call is a guarded no-op when Firebase is not configured (e.g. a build
/// without `google-services.json` / `GoogleService-Info.plist`), so the rest of
/// the app keeps working in that case.
class PushService {
  PushService._();

  static final PushService instance = PushService._();

  static const _channelId = 'default';
  static const _channelName = 'AddisHome';

  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  /// The FCM token of this device, cached for sign-out cleanup.
  String? _token;
  RealtimeChannel? _realtimeChannel;
  bool _configured = false;
  bool _initialized = false;

  /// Callback invoked when a notification is tapped; the app wires this to
  /// navigation (listing → detail, anything else → notifications).
  void Function(Map<String, dynamic> data)? onTap;

  /// Sets up Firebase (if present), the Android notification channel and the
  /// local-notifications plugin. Safe to call more than once.
  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
    } catch (e) {
      // Firebase not configured for this build — local banner still works.
      debugPrint('push: firebase init skipped: $e');
      return;
    }
    _configured = true;

    try {
      const android = AndroidInitializationSettings('@mipmap/ic_launcher');
      const settings = InitializationSettings(
        android: android,
        iOS: DarwinInitializationSettings(),
      );
      await _local.initialize(
        settings: settings,
        onDidReceiveNotificationResponse: (response) =>
            _handleTap(response.payload),
      );
    } catch (e) {
      debugPrint('push: local notifications init failed: $e');
    }
  }

  /// Binds navigation for notification taps while the app is running. On a
  /// cold start the launcher's payload is handled after a short delay.
  Future<void> bindTapHandler(void Function(Map<String, dynamic>)? handler) async {
    if (handler != null) onTap = handler;
    try {
      final details = await _local.getNotificationAppLaunchDetails();
      if (details?.didNotificationLaunchApp == true && details!.notificationResponse != null) {
        _handleTap(details.notificationResponse!.payload);
      }
    } catch (e) {
      debugPrint('push: launch details failed: $e');
    }
  }

  void _handleTap(String? payload) {
    if (payload == null || payload.isEmpty) return;
    try {
      onTap?.call(_decodePayload(payload));
    } catch (e) {
      debugPrint('push: tap handler failed: $e');
    }
  }

  Map<String, dynamic> _decodePayload(String raw) {
    // Local payloads are JSON we encoded ourselves; push `data` arrives as a
    // query-string encoded map from Expo. Handle both.
    try {
      final map = _parseQuery(raw);
      if (map.isNotEmpty) return map;
    } catch (_) {}
    return {'notificationId': raw};
  }

  static Map<String, dynamic> _parseQuery(String raw) {
    final out = <String, dynamic>{};
    for (final part in raw.split('&')) {
      final pair = part.split('=');
      if (pair.length != 2) continue;
      out[Uri.decodeComponent(pair[0])] = Uri.decodeComponent(pair[1]);
    }
    return out;
  }

  /// Registers the device token for the signed-in user and subscribes to
  /// realtime notifications. Call after sign-in; pass `null` to sign out.
  Future<void> onAuthChanged(String? userId) async {
    if (userId != null) {
      await _registerToken(userId);
      await _subscribe(userId);
    } else {
      await _unregister();
      _unsubscribe();
    }
  }

  Future<void> _registerToken(String userId) async {
    if (!_configured) return;
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      final token = await messaging.getToken();
      if (token == null) return;
      _token = token;
      await SupabaseApi.claimPushToken(token, platform: defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android');
    } catch (e) {
      debugPrint('push: token registration failed: $e');
    }
  }

  Future<void> _unregister() async {
    final token = _token;
    _token = null;
    if (token == null) return;
    try {
      await SupabaseApi.deletePushToken(token);
    } catch (e) {
      debugPrint('push: token removal failed: $e');
    }
  }

  Future<void> _subscribe(String userId) async {
    _unsubscribe();
    try {
      _realtimeChannel = AppSupabase.client
          .channel('push-notif-$userId')
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'notifications',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'user_id',
              value: userId,
            ),
            callback: (payload) {
              _onRealtime(payload);
            },
          )
          .subscribe();
    } catch (e) {
      debugPrint('push: realtime subscribe failed: $e');
    }
  }

  void _onRealtime(PostgresChangePayload payload) {
    final row = payload.newRecord;
    if (row == null) return;
    final type = row['type'] as String? ?? '';
    final notif = _buildNotification(row);
    // Best-effort local banner; never throws into the realtime callback.
    unawaited(_showLocal(notif, type));
  }

  Future<void> _showLocal(AppNotification n, String type) async {
    if (!_configured) return;
    try {
      const android = AndroidNotificationDetails(
        _channelId,
        _channelName,
        channelDescription: 'AddisHome notifications',
        importance: Importance.max,
        priority: Priority.high,
      );
      const details = NotificationDetails(android: android, iOS: DarwinNotificationDetails());
      final payload = [
        if (n.listingId != null) 'listingId=${Uri.encodeComponent(n.listingId!)}',
        'notificationId=${Uri.encodeComponent(n.id)}',
        if (n.title != null) 'title=${Uri.encodeComponent(n.title!)}',
      ].join('&');
      await _local.show(
        id: n.id.hashCode,
        title: _titleFor(type, n),
        body: n.title ?? _titleFor(type, n),
        notificationDetails: details,
        payload: payload,
      );
    } catch (e) {
      debugPrint('push: local show failed: $e');
    }
  }

  String _titleFor(String type, AppNotification n) {
    switch (type) {
      case 'new_message':
        return 'New message';
      case 'callback_request':
        return 'Callback request';
      case 'offer_received':
        return 'New offer';
      case 'offer_response':
        return 'Offer update';
      case 'listing_sold':
        return 'Sold out';
      case 'price_drop':
        return 'Price drop';
      case 'saved_search_match':
        return 'New match';
      case 'seller_verified':
        return 'Shop verified';
      case 'seller_rejected':
        return 'Verification needs changes';
      default:
        return 'AddisHome';
    }
  }

  AppNotification _buildNotification(Map<String, dynamic> row) {
    final payload = row['payload'] as Map<String, dynamic>?;
    return AppNotification(
      id: row['id'] as String? ?? '',
      type: row['type'] as String? ?? '',
      title: payload?['title'] as String?,
      listingId: payload?['listingId'] as String?,
      isRead: false,
      createdAt: row['created_at'] != null
          ? DateTime.tryParse(row['created_at'] as String) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  void _unsubscribe() {
    try {
      _realtimeChannel?.unsubscribe();
    } catch (_) {}
    _realtimeChannel = null;
  }
}
