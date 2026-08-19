import 'dart:async';

import 'package:flutter/material.dart';

import 'core/network/connectivity.dart';
import 'core/notifications/push_service.dart';
import 'core/navigation/routes.dart';
import 'core/state/app_state.dart';
import 'core/theme/app_theme.dart';
import 'features/shell/presentation/main_tabs.dart';

/// Root widget: app-wide theme + offline banner + auth gate.
class AddisFurnishApp extends StatelessWidget {
  const AddisFurnishApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppState.instance,
      builder: (context, _) {
        return MaterialApp(
          title: 'AddisFurnish',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          themeMode: ThemeMode.light,
          builder: (context, child) => OfflineAware(
            child: PushBinder(child: child),
          ),
          home: const RootGate(),
          // The OAuth deep link (addisfurnish://?code=…) is delivered to
          // supabase_flutter via app_links; the engine also pushes it as a
          // route. Swallow unknown routes so that navigation never throws.
          onUnknownRoute: (settings) =>
              MaterialPageRoute(builder: (_) => const RootGate()),
        );
      },
    );
  }
}

/// Wires the push service: initialises the local-notification plugin, registers
/// the device token + realtime banner when a user signs in (and cleans up on
/// sign-out), and deep-links notification taps to the right screen.
class PushBinder extends StatefulWidget {
  const PushBinder({super.key, required this.child});

  final Widget? child;

  @override
  State<PushBinder> createState() => _PushBinderState();
}

class _PushBinderState extends State<PushBinder> {
  String? _lastUid;

  @override
  void initState() {
    super.initState();
    PushService.instance.onTap = _handleTap;
    unawaited(PushService.instance.init());
    _sync();
    AppState.instance.addListener(_sync);
  }

  @override
  void dispose() {
    AppState.instance.removeListener(_sync);
    super.dispose();
  }

  void _sync() {
    final uid = AppState.instance.userId;
    if (uid == _lastUid) return;
    _lastUid = uid;
    unawaited(PushService.instance.onAuthChanged(uid));
    unawaited(PushService.instance.bindTapHandler(_handleTap));
  }

  Future<void> _handleTap(Map<String, dynamic> data) async {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final listingId = data['listingId'];
      if (listingId is String && listingId.isNotEmpty) {
        if (AppState.instance.userId != null) {
          Routes.listingById(context, listingId);
        } else {
          Routes.notifications(context);
        }
      } else if (AppState.instance.userId != null) {
        Routes.notifications(context);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return widget.child ?? const SizedBox.shrink();
  }
}

/// Shows a loading spinner while Supabase boots, then always lands on the
/// main tab shell. Auth is gated per-feature (favorites, sell, messages,
/// profile) rather than at the root — guests can browse freely.
class RootGate extends StatelessWidget {
  const RootGate({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    if (state.loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return const MainTabs();
  }
}

/// Shows a dismissible "You are offline" banner on top of the app when the
/// device loses connectivity.
class OfflineAware extends StatefulWidget {
  const OfflineAware({super.key, required this.child});

  final Widget? child;

  @override
  State<OfflineAware> createState() => _OfflineAwareState();
}

class _OfflineAwareState extends State<OfflineAware> {
  late StreamSubscription<bool> _sub;
  bool _offline = false;

  @override
  void initState() {
    super.initState();
    _sub = ConnectivityService.instance.onChanged.listen((online) {
      if (mounted) setState(() => _offline = !online);
    });
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final child = widget.child ?? const SizedBox.shrink();
    if (!_offline) return child;
    return Column(
      children: [
        Material(
          color: Theme.of(context).colorScheme.errorContainer,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.wifi_off,
                    size: 16,
                    color: Theme.of(context).colorScheme.onErrorContainer,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'You are offline',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onErrorContainer,
                        ),
                  ),
                ],
              ),
            ),
          ),
        ),
        Expanded(child: child),
      ],
    );
  }
}
