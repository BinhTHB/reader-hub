import 'package:flutter/material.dart';

class AppTheme {
  // Colors matching React Web App
  static const Color primary = Color(0xFF6C5CE7);
  static const Color secondary = Color(0xFF8E7BFF);
  static const Color background = Color(0xFFFFFFFF);
  static const Color foreground = Color(0xFF1E1E1E);
  static const Color card = Color(0xFFFFFFFF);
  static const Color muted = Color(0xFFF5F5F5);
  static const Color mutedForeground = Color(0xFF6B6B6B);
  static const Color border = Color(0x1A000000);
  static const Color inputBackground = Color(0xFFF9F9F9);

  // Dark mode colors
  static const Color darkBackground = Color(0xFF121212);
  static const Color darkForeground = Color(0xFFFFFFFF);
  static const Color darkCard = Color(0xFF1E1E1E);
  static const Color darkMuted = Color(0xFF2A2A2A);
  static const Color darkMutedForeground = Color(0xFF9E9E9E);
  static const Color darkBorder = Color(0x1AFFFFFF);

  static ThemeData lightTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    primaryColor: primary,
    scaffoldBackgroundColor: background,
    colorScheme: const ColorScheme.light(
      primary: primary,
      secondary: secondary,
      surface: card,
      background: background,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onSurface: foreground,
      onBackground: foreground,
    ),
    cardTheme: CardThemeData(
      color: card,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: border, width: 1),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: primary,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: inputBackground,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: primary, width: 2),
      ),
    ),
    textTheme: const TextTheme(
      displayLarge: TextStyle(fontSize: 32, fontWeight: FontWeight.w500, color: foreground),
      displayMedium: TextStyle(fontSize: 28, fontWeight: FontWeight.w500, color: foreground),
      displaySmall: TextStyle(fontSize: 24, fontWeight: FontWeight.w500, color: foreground),
      headlineMedium: TextStyle(fontSize: 20, fontWeight: FontWeight.w500, color: foreground),
      headlineSmall: TextStyle(fontSize: 18, fontWeight: FontWeight.w500, color: foreground),
      titleLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: foreground),
      bodyLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w400, color: foreground),
      bodyMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w400, color: foreground),
      bodySmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: mutedForeground),
    ),
  );

  static ThemeData darkTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    primaryColor: secondary,
    scaffoldBackgroundColor: darkBackground,
    colorScheme: const ColorScheme.dark(
      primary: secondary,
      secondary: primary,
      surface: darkCard,
      background: darkBackground,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onSurface: darkForeground,
      onBackground: darkForeground,
    ),
    cardTheme: CardThemeData(
      color: darkCard,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: darkBorder, width: 1),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: secondary,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: secondary,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: darkMuted,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: darkBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: darkBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: secondary, width: 2),
      ),
    ),
    textTheme: const TextTheme(
      displayLarge: TextStyle(fontSize: 32, fontWeight: FontWeight.w500, color: darkForeground),
      displayMedium: TextStyle(fontSize: 28, fontWeight: FontWeight.w500, color: darkForeground),
      displaySmall: TextStyle(fontSize: 24, fontWeight: FontWeight.w500, color: darkForeground),
      headlineMedium: TextStyle(fontSize: 20, fontWeight: FontWeight.w500, color: darkForeground),
      headlineSmall: TextStyle(fontSize: 18, fontWeight: FontWeight.w500, color: darkForeground),
      titleLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: darkForeground),
      bodyLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w400, color: darkForeground),
      bodyMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w400, color: darkForeground),
      bodySmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: darkMutedForeground),
    ),
  );
}
