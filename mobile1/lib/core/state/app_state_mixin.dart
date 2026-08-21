import 'package:flutter/material.dart';
import '../state/app_state.dart';

/// Add this mixin to any [State] class that reads [AppState.instance.t()] in
/// its [build] method. It automatically subscribes to [AppState] changes and
/// calls [setState] whenever the language (or any other app-wide state) changes,
/// so the UI rebuilds with the correct translations.
///
/// Usage:
/// ```dart
/// class _MyScreenState extends State<MyScreen> with AppStateMixin {
///   ...
/// }
/// ```
///
/// No extra code needed — `initState`/`dispose` hooks are handled by the mixin.
mixin AppStateMixin<T extends StatefulWidget> on State<T> {
  void _onAppStateChange() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    AppState.instance.addListener(_onAppStateChange);
  }

  @override
  void dispose() {
    AppState.instance.removeListener(_onAppStateChange);
    super.dispose();
  }
}
