import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'colors.dart';

/// Builds the AddisHome theme. Cream paper / walnut ink / terracotta —
/// mirrors `web/src/styles.css` with Fraunces (display serif) + DM Sans.
class AppTheme {
  AppTheme._();

  static const double radius = 8;

  static ThemeData light() => _build(Brightness.light);

  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final bool isDark = brightness == Brightness.dark;
    final Color background = isDark ? AppColors.darkBackground : AppColors.background;
    final Color foreground = isDark ? AppColors.darkForeground : AppColors.foreground;
    final Color card = isDark ? AppColors.darkCard : AppColors.card;
    final Color cardForeground = isDark ? AppColors.darkCardForeground : AppColors.cardForeground;
    final Color primary = isDark ? AppColors.darkPrimary : AppColors.primary;
    final Color primaryForeground =
        isDark ? AppColors.darkPrimaryForeground : AppColors.primaryForeground;
    final Color secondary = isDark ? AppColors.darkSecondary : AppColors.secondary;
    final Color secondaryForeground =
        isDark ? AppColors.darkSecondaryForeground : AppColors.secondaryForeground;
    final Color mutedForeground = isDark ? AppColors.darkMutedForeground : AppColors.mutedForeground;
    final Color destructive = isDark ? AppColors.darkDestructive : AppColors.destructive;
    final Color border = isDark ? AppColors.darkBorder : AppColors.border;

    final ColorScheme scheme = ColorScheme(
      brightness: brightness,
      primary: primary,
      onPrimary: primaryForeground,
      secondary: secondary,
      onSecondary: secondaryForeground,
      error: destructive,
      onError: AppColors.destructiveForeground,
      surface: card,
      onSurface: cardForeground,
      outline: border,
      outlineVariant: border,
      onSurfaceVariant: mutedForeground,
    );

    final TextTheme textTheme = TextTheme(
      displayLarge: GoogleFonts.fraunces(
        fontSize: 34,
        fontWeight: FontWeight.w600,
        color: foreground,
      ),
      displayMedium: GoogleFonts.fraunces(
        fontSize: 28,
        fontWeight: FontWeight.w600,
        color: foreground,
      ),
      headlineMedium: GoogleFonts.fraunces(
        fontSize: 22,
        fontWeight: FontWeight.w600,
        color: foreground,
      ),
      titleLarge: GoogleFonts.dmSans(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: foreground,
      ),
      titleMedium: GoogleFonts.dmSans(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: foreground,
      ),
      titleSmall: GoogleFonts.dmSans(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: foreground,
      ),
      bodyLarge: GoogleFonts.dmSans(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        color: foreground,
      ),
      bodyMedium: GoogleFonts.dmSans(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        color: foreground,
      ),
      bodySmall: GoogleFonts.dmSans(
        fontSize: 12,
        fontWeight: FontWeight.w400,
        color: mutedForeground,
      ),
      labelLarge: GoogleFonts.dmSans(
        fontSize: 15,
        fontWeight: FontWeight.w600,
        color: foreground,
      ),
      labelMedium: GoogleFonts.dmSans(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: foreground,
      ),
      labelSmall: GoogleFonts.dmSans(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        color: mutedForeground,
      ),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      textTheme: textTheme,
      fontFamily: 'DM Sans',
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: foreground,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.fraunces(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: foreground,
        ),
      ),
      cardTheme: CardThemeData(
        color: card,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius * 2),
          side: BorderSide(color: border),
        ),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: card,
        hintStyle: GoogleFonts.dmSans(color: mutedForeground, fontSize: 15),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius * 1.5),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius * 1.5),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius * 1.5),
          borderSide: BorderSide(color: primary, width: 1.5),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: primaryForeground,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius * 1.5)),
          textStyle: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: foreground,
          side: BorderSide(color: border),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius * 1.5)),
          textStyle: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: primary,
          textStyle: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: secondary,
        selectedColor: primary,
        labelStyle: GoogleFonts.dmSans(color: secondaryForeground, fontSize: 13),
        side: BorderSide.none,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: foreground,
        contentTextStyle: GoogleFonts.dmSans(color: background, fontSize: 14),
        behavior: SnackBarBehavior.floating,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.primary),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: card,
        selectedItemColor: primary,
        unselectedItemColor: mutedForeground,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
    );
  }
}

/// Convenience extension for the accent/success/muted colours used across
/// widgets without referencing the mode.
extension BuildContextTheme on BuildContext {
  bool get isDark => Theme.of(this).brightness == Brightness.dark;

  Color get themeBackground => isDark ? AppColors.darkBackground : AppColors.background;
  Color get themeForeground => isDark ? AppColors.darkForeground : AppColors.foreground;
  Color get themeCard => isDark ? AppColors.darkCard : AppColors.card;
  Color get themePrimary => isDark ? AppColors.darkPrimary : AppColors.primary;
  Color get themeMutedForeground =>
      isDark ? AppColors.darkMutedForeground : AppColors.mutedForeground;
  Color get themeAccent => isDark ? AppColors.darkAccent : AppColors.accent;
  Color get themeSecondary => isDark ? AppColors.darkSecondary : AppColors.secondary;
  Color get themeDestructive => isDark ? AppColors.darkDestructive : AppColors.destructive;
  Color get themeSuccess => isDark ? AppColors.darkSuccess : AppColors.success;
  Color get themeBorder => isDark ? AppColors.darkBorder : AppColors.border;
}
