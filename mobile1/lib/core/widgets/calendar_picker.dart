import 'package:flutter/material.dart';

/// Minimal calendar: tap a day to select it. Used for the discount expiry
/// date in the sell form, so the seller picks a date instead of typing one.
/// Mirrors the RN `CalendarPicker` component (week starts on Monday, past
/// days are disabled, selected day clears).
class CalendarPicker extends StatefulWidget {
  const CalendarPicker({super.key, this.value, required this.onChange, this.minDate});

  /// ISO date string (yyyy-mm-dd or full ISO timestamp), or null when cleared.
  final String? value;
  final ValueChanged<String?> onChange;

  /// Earliest selectable day (defaults to today).
  final DateTime? minDate;

  @override
  State<CalendarPicker> createState() => _CalendarPickerState();
}

class _CalendarPickerState extends State<CalendarPicker> {
  static const _months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  late DateTime _min;
  late DateTime _view;

  DateTime? get _selected {
    final v = widget.value;
    if (v == null) return null;
    return DateTime.tryParse(v);
  }

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    _min = widget.minDate ?? today;
    final base = _selected ?? _min;
    _view = DateTime(base.year, base.month);
  }

  static String _dayKey(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  void _shiftMonth(int delta) {
    setState(() => _view = DateTime(_view.year, _view.month + delta));
  }

  void _select(DateTime date) {
    final end = DateTime(date.year, date.month, date.day, 23, 59, 59);
    widget.onChange(end.toUtc().toIso8601String());
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final selected = _selected;
    final daysInMonth = DateTime(_view.year, _view.month + 1, 0).day;
    // 0 = Sunday … 6 = Saturday; grid starts on Monday.
    final lead = (DateTime(_view.year, _view.month, 1).weekday) % 7;

    final cells = <int?>[
      ...List.filled(lead, null),
      for (int i = 1; i <= daysInMonth; i++) i,
    ];

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _navBtn(theme, Icons.chevron_left, () => _shiftMonth(-1)),
              Text(
                '${_months[_view.month - 1]} ${_view.year}',
                style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
              _navBtn(theme, Icons.chevron_right, () => _shiftMonth(1)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              for (final d in const ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'])
                Expanded(
                  child: Text(
                    d,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.labelSmall
                        ?.copyWith(color: theme.colorScheme.outline, fontWeight: FontWeight.w600),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              for (final day in cells)
                Expanded(child: _cell(theme, day, selected)),
            ],
          ),
          if (selected != null)
            InkWell(
              onTap: () => widget.onChange(null),
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  '✕ ${_dayKey(selected)}',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _navBtn(ThemeData theme, IconData icon, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Icon(icon, size: 17, color: theme.colorScheme.onSurface),
      ),
    );
  }

  Widget _cell(ThemeData theme, int? day, DateTime? selected) {
    if (day == null) return const SizedBox(height: 36);
    final date = DateTime(_view.year, _view.month, day);
    final iso = _dayKey(date);
    final isSelected = selected != null && _dayKey(selected) == iso;
    final disabled = date.isBefore(_min);

    return InkWell(
      onTap: disabled ? null : () => _select(date),
      borderRadius: BorderRadius.circular(999),
      child: Container(
        height: 36,
        alignment: Alignment.center,
        decoration: isSelected
            ? BoxDecoration(color: theme.colorScheme.primary, shape: BoxShape.circle)
            : null,
        child: Text(
          '$day',
          style: theme.textTheme.bodySmall?.copyWith(
            color: isSelected
                ? theme.colorScheme.onPrimary
                : disabled
                    ? theme.colorScheme.outline.withValues(alpha: 0.45)
                    : theme.colorScheme.onSurface,
            fontWeight: isSelected ? FontWeight.w700 : null,
          ),
        ),
      ),
    );
  }
}
