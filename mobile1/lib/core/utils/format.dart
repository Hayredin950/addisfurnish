import 'package:intl/intl.dart';

/// Formatting helpers matching the web app (ETB currency, relative time,
/// Ethiopian calendar dates).
class Fmt {
  Fmt._();

  static final NumberFormat _etb = NumberFormat.decimalPattern('en');

  /// "12,500 ETB"
  static String birr(num? value) {
    final n = value ?? 0;
    return '${_etb.format(n.round())} ETB';
  }

  /// Compact "12.5k" for small surfaces.
  static String birrCompact(num? value) {
    final n = (value ?? 0).toDouble();
    if (n >= 1000000) return '${_num(n / 1000000)}M ETB';
    if (n >= 1000) return '${_num(n / 1000)}k ETB';
    return '${n.round()} ETB';
  }

  static String _num(double v) => v == v.roundToDouble() ? '${v.round()}' : v.toStringAsFixed(1);

  static String timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    final mins = diff.inMinutes;
    if (mins < 1) return 'just now';
    if (mins < 60) return '${mins}m ago';
    final hours = (mins / 60).round();
    if (hours < 24) return '${hours}h ago';
    final days = (hours / 24).round();
    if (days < 30) return '${days}d ago';
    return DateFormat('MMM d, y').format(dt);
  }

  static String timeAgoShort(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    return DateFormat('MMM d').format(dt);
  }

  static String dateTime(DateTime dt) => DateFormat('MMM d, y • HH:mm').format(dt);

  static String chatTime(DateTime dt) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(dt.year, dt.month, dt.day);
    if (day == today) return DateFormat('HH:mm').format(dt);
    if (day == today.subtract(const Duration(days: 1))) return 'Yesterday';
    return DateFormat('MMM d').format(dt);
  }

  static String dayLabel(DateTime dt) => DateFormat('EEEE').format(dt);

  /// Gregorian -> Ethiopian calendar date (12x30 + Pagume).
  static ({int day, int month, int year}) toEthiopianDate(DateTime date) {
    int jdn(DateTime d) {
      int y = d.year, m = d.month, dd = d.day;
      final a = ((14 - m) / 12).floor();
      final Y = y + 4800 - a;
      final M = m + 12 * a - 3;
      return dd + ((153 * M + 2) / 5).floor() + 365 * Y + (Y / 4).floor() -
          (Y / 100).floor() + (Y / 400).floor() - 32045;
    }

    const epoch = 1724221; // 1 Meskerem 1 EC
    final diff = jdn(date) - epoch;
    final cycles = (diff / 1461).floor();
    final rem = diff % 1461;
    final yearInCycle = (rem / 365).floor().clamp(0, 3);
    final dayInYear = rem - 365 * yearInCycle;
    final month = (dayInYear / 30).floor().clamp(0, 12);
    final day = dayInYear - month * 30 + 1;
    return (day: day, month: month + 1, year: 4 * cycles + yearInCycle + 1);
  }

  static const List<String> ethiopianMonths = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume',
  ];

  static String ethiopianDate(DateTime date) {
    final e = toEthiopianDate(date);
    return '${e.day} ${ethiopianMonths[e.month - 1]} ${e.year}';
  }

  /// Normalizes an Ethiopian phone number to +251 format, or null.
  static String? normalizePhone(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 9 && RegExp(r'^[79]').hasMatch(digits)) return '+251$digits';
    if (digits.length == 10 && digits.startsWith('0') && RegExp(r'^09|^07').hasMatch(digits)) {
      return '+251${digits.substring(1)}';
    }
    if (digits.length == 12 && digits.startsWith('251')) return '+$digits';
    return null;
  }
}
