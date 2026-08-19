import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Lightweight key/value persistence backed by SharedPreferences.
/// Centralised here so call sites never touch the plugin directly.
class AppPrefs {
  AppPrefs._();

  static SharedPreferences? _prefs;

  static Future<void> ensureReady() async {
    _prefs ??= await SharedPreferences.getInstance();
  }

  static SharedPreferences get _p {
    final p = _prefs;
    if (p == null) {
      throw StateError('AppPrefs.ensureReady() must be awaited first.');
    }
    return p;
  }

  static String getString(String key, [String fallback = '']) =>
      _p.getString(key) ?? fallback;

  static Future<void> setString(String key, String value) => _p.setString(key, value);

  static bool getBool(String key, [bool fallback = false]) => _p.getBool(key) ?? fallback;

  static Future<void> setBool(String key, bool value) => _p.setBool(key, value);

  static int getInt(String key, [int fallback = 0]) => _p.getInt(key) ?? fallback;

  static Future<void> setInt(String key, int value) => _p.setInt(key, value);

  static List<String> getStringList(String key) => _p.getStringList(key) ?? const [];

  static Future<void> setStringList(String key, List<String> value) =>
      _p.setStringList(key, value);

  static String? getJson(String key) => _p.getString(key);

  static Future<void> setJson(String key, Object value) =>
      _p.setString(key, jsonEncode(value));

  static Future<void> remove(String key) => _p.remove(key);
}
