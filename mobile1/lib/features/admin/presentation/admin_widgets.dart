import 'package:flutter/material.dart';

import '../../../core/state/app_state.dart';

/// Shared building blocks for the extended admin panel (dashboard, analytics,
/// audit, telegram, settings). Kept lean — the heavier per-tab widgets live in
/// their own files.

void adminSnack(BuildContext context, String msg) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}

Widget adminErrorView(BuildContext context, String error, VoidCallback retry) {
  return Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(padding: const EdgeInsets.symmetric(horizontal: 24), child: Text(error)),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: retry,
          child: Text(AppState.instance.t('common.retry')),
        ),
      ],
    ),
  );
}

Widget adminEmpty(BuildContext context, String key) {
  return Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Text(
        AppState.instance.t(key),
        style: Theme.of(context).textTheme.bodyMedium,
        textAlign: TextAlign.center,
      ),
    ),
  );
}

/// Card with an optional title row — the standard admin panel section.
class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    this.title,
    this.icon,
    this.trailing,
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  final String? title;
  final IconData? icon;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: Padding(
        padding: padding,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (title != null) ...[
              Row(
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 16, color: Theme.of(context).colorScheme.primary),
                    const SizedBox(width: 6),
                  ],
                  Expanded(
                    child: Text(title!, style: Theme.of(context).textTheme.titleMedium),
                  ),
                  ?trailing,
                ],
              ),
              const SizedBox(height: 12),
            ],
            child,
          ],
        ),
      ),
    );
  }
}

/// Compact icon + value + label strip item (engagement-style metrics).
class EngRow extends StatelessWidget {
  const EngRow({super.key, required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final Object value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: theme.colorScheme.primary),
        const SizedBox(width: 4),
        Text('$value', style: theme.textTheme.bodyMedium),
        const SizedBox(width: 4),
        Text(label, style: theme.textTheme.bodySmall),
      ],
    );
  }
}

/// One vertical list row with a proportional bar (top categories, searches…).
class BarRow extends StatelessWidget {
  const BarRow({
    super.key,
    required this.label,
    required this.count,
    required this.max,
  });

  final String label;
  final int count;
  final int max;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium),
              ),
              Text('$count', style: theme.textTheme.labelMedium),
            ],
          ),
          const SizedBox(height: 3),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: count / max,
              minHeight: 7,
            ),
          ),
        ],
      ),
    );
  }
}

/// A coloured status/value pill used on cards (active state, urgency…).
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
      ),
    );
  }
}