import 'package:flutter/material.dart';
import '../../../core/state/app_state.dart';

class SafetyScreen extends StatelessWidget {
  const SafetyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final theme = Theme.of(context);

    final rules = [
      (Icons.location_on_outlined, 'safetyMeetTitle', 'safetyMeetBody'),
      (Icons.visibility_outlined, 'safetyInspectTitle', 'safetyInspectBody'),
      (Icons.payments_outlined, 'safetyPayTitle', 'safetyPayBody'),
      (Icons.chat_bubble_outline, 'safetyPlatformTitle', 'safetyPlatformBody'),
      (Icons.verified_user_outlined, 'safetyCheckTitle', 'safetyCheckBody'),
      (Icons.error_outline, 'safetyReportTitle', 'safetyReportBody'),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(state.t('safetyTitle')),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                state.t('safetyTitle'),
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  fontFamily: 'Georgia',
                ),
              ),
              const SizedBox(height: 6),
              Text(
                state.t('safetySubtitle'),
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
              ),
              const SizedBox(height: 24),
              ...rules.map((r) => _buildRule(theme, state, r.$1, state.t(r.$2), state.t(r.$3))),
              const SizedBox(height: 32),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: theme.colorScheme.outlineVariant),
                ),
                child: Text(
                  state.t('safetySellerNote'),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRule(ThemeData theme, AppState state, IconData icon, String title, String body) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: theme.colorScheme.primaryContainer,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 20, color: theme.colorScheme.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(body, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
