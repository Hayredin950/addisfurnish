import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../storage/app_prefs.dart';

/// Cache entry with timestamp so we can implement TTL + stale-while-revalidate.
class CacheEntry<T> {
  CacheEntry({required this.data, required this.savedAt});

  final T data;
  final DateTime savedAt;

  bool get isStale => DateTime.now().difference(savedAt) > const Duration(minutes: 5);
}

/// A small cache layer for domain objects.
///
/// - **In-memory** first for speed, **SharedPreferences** for persistence so
///   data survives restarts (offline-first reading).
/// - Entries carry a timestamp; callers decide whether to accept fresh/stale
///   data and re-fetch in the background (stale-while-revalidate).
/// - Serialization is pluggable per cache name.
class CacheManager {
  CacheManager._();

  static final CacheManager instance = CacheManager._();

  final Map<String, CacheEntry<dynamic>> _memory = {};

  /// Returns a fresh entry from memory if available.
  CacheEntry<T>? peekMemory<T>(String key) {
    final entry = _memory[key];
    if (entry == null) return null;
    return CacheEntry<T>(data: entry.data as T, savedAt: entry.savedAt);
  }

  /// Puts an entry into memory. Use [persist] to also write to prefs.
  void putMemory<T>(String key, T data, {bool persist = false, String? prefsKey}) {
    _memory[key] = CacheEntry(data: data, savedAt: DateTime.now());
    if (persist) {
      final encoded = jsonEncode({
        'savedAt': DateTime.now().toIso8601String(),
        'data': data,
      });
      AppPrefs.setJson(prefsKey ?? key, encoded);
    }
  }

  /// Reads a persisted entry (from restart-persistent prefs) if present.
  CacheEntry<T>? readPersisted<T>(String key, T Function(Object?) fromJson) {
    final raw = AppPrefs.getJson(key);
    if (raw == null) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final data = fromJson(map['data']);
      final savedAt = DateTime.tryParse(map['savedAt'] as String? ?? '');
      if (savedAt == null) return null;
      return CacheEntry<T>(data: data, savedAt: savedAt);
    } catch (e) {
      debugPrint('cache read failed for $key: $e');
      return null;
    }
  }

  /// Removes an entry (e.g. after a mutation invalidates it).
  void remove(String key) {
    _memory.remove(key);
  }

  /// Convenience: reads memory first, then persisted prefs, with optional
  /// [fromJson] used to rebuild objects from persisted data.
  T? read<T>(String key, {T Function(Object?)? fromJson}) {
    final mem = peekMemory<T>(key);
    if (mem != null) return mem.data;
    if (fromJson != null) {
      final persisted = readPersisted<T>(key, fromJson);
      if (persisted != null) {
        _memory[key] = CacheEntry(data: persisted.data, savedAt: persisted.savedAt);
        return persisted.data;
      }
    }
    return null;
  }

  /// Convenience: writes to memory and (optionally) persists to prefs using
  /// [toJson] to serialize.
  void put<T>(String key, T data, {bool persist = false, Object? Function(T)? toJson}) {
    _memory[key] = CacheEntry(data: data, savedAt: DateTime.now());
    if (persist && toJson != null) {
      AppPrefs.setJson(key, {'savedAt': DateTime.now().toIso8601String(), 'data': toJson(data)});
    }
  }

  void clear() => _memory.clear();
}
