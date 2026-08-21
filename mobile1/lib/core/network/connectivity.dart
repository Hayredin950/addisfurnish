import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

/// Tracks connectivity and exposes a broadcast stream so the shell can show
/// an offline banner and repositories can fall back to cache.
class ConnectivityService {
  ConnectivityService._();

  static final ConnectivityService instance = ConnectivityService._();

  final _controller = StreamController<bool>.broadcast();
  bool _online = true;

  Stream<bool> get onChanged => _controller.stream;

  bool get isOnline => _online;

  Future<void> start() async {
    _online = await _isOnline();
    // connectivity_plus 6 yields a List<ConnectivityResult>.
    Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online != _online) {
        _online = online;
        debugPrint('connectivity changed -> online=$online');
        _controller.add(online);
      }
    });
  }

  Future<bool> _isOnline() async {
    try {
      final results = await Connectivity().checkConnectivity();
      return results.any((r) => r != ConnectivityResult.none);
    } catch (_) {
      return true;
    }
  }

  void dispose() => _controller.close();
}
