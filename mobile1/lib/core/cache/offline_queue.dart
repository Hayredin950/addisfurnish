import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../storage/app_prefs.dart';

/// A minimal offline queue for writes that should be retried later.
/// Actions are persisted as JSON in prefs and flushed on connectivity.
class OfflineQueue {
  OfflineQueue._();

  static final OfflineQueue instance = OfflineQueue._();

  static const _key = 'offline_queue';

  List<Map<String, dynamic>> _actions() {
    final raw = AppPrefs.getJson(_key);
    if (raw == null) return const [];
    try {
      return (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('offline queue decode failed: $e');
      return const [];
    }
  }

  Future<void> _write(List<Map<String, dynamic>> actions) =>
      AppPrefs.setJson(_key, actions);

  /// Enqueues a deferred write: [id] unique, [payload] is arbitrary.
  Future<void> enqueue({
    required String id,
    required String action,
    Map<String, dynamic>? payload,
  }) async {
    final actions = _actions();
    actions.removeWhere((a) => a['id'] == id);
    actions.add({
      'id': id,
      'action': action,
      'payload': payload ?? const {},
      'queuedAt': DateTime.now().toUtc().toIso8601String(),
    });
    await _write(actions);
  }

  Future<void> dequeue(String id) async {
    final actions = _actions()..removeWhere((a) => a['id'] == id);
    await _write(actions);
  }

  List<Map<String, dynamic>> pending() => _actions();

  Future<void> clear() => AppPrefs.remove(_key);
}
