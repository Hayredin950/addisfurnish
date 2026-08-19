import 'package:flutter/material.dart';

import '../../../core/state/app_state.dart';
import 'auth_screen.dart';

/// Shown inside a protected tab when the user is not signed in.
/// Provides a friendly, contextual message + Sign in / Create account CTAs.
class GuestGate extends StatelessWidget {
  const GuestGate({
    super.key,
    required this.icon,
    required this.titleKey,
    required this.subtitleKey,
  });

  final IconData icon;
  final String titleKey;
  final String subtitleKey;

  factory GuestGate.saved() => const GuestGate(
        icon: Icons.favorite_outline,
        titleKey: 'guest.savedTitle',
        subtitleKey: 'guest.savedSubtitle',
      );

  factory GuestGate.messages() => const GuestGate(
        icon: Icons.chat_bubble_outline,
        titleKey: 'guest.messagesTitle',
        subtitleKey: 'guest.messagesSubtitle',
      );

  factory GuestGate.sell() => const GuestGate(
        icon: Icons.add_circle_outline,
        titleKey: 'guest.sellTitle',
        subtitleKey: 'guest.sellSubtitle',
      );

  factory GuestGate.profile() => const GuestGate(
        icon: Icons.person_outline,
        titleKey: 'guest.profileTitle',
        subtitleKey: 'guest.profileSubtitle',
      );

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 88,
                  height: 88,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primaryContainer,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, size: 40, color: theme.colorScheme.primary),
                ),
                const SizedBox(height: 24),
                Text(
                  state.t(titleKey),
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  state.t(subtitleKey),
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => _openAuth(context),
                    icon: const Icon(Icons.login, size: 18),
                    label: Text(state.t('auth.signIn')),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => _openAuth(context),
                    icon: const Icon(Icons.person_add_outlined, size: 18),
                    label: Text(state.t('auth.createAccount')),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _openAuth(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => const AuthScreen(),
      ),
    );
  }
}
