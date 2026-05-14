/**
 * Design System — Colors, Typography, Spacing
 *
 * Dark-first design with premium aesthetics for a reading app.
 */

export const Colors = {
  // Primary palette — warm amber tones for a "book" feel
  primary: "#F5A623",
  primaryLight: "#FFD080",
  primaryDark: "#C47F17",

  // Background layers (dark mode)
  bg: "#0F0F1A",
  bgCard: "#1A1A2E",
  bgElevated: "#242440",
  bgOverlay: "rgba(0, 0, 0, 0.6)",

  // Text hierarchy
  textPrimary: "#F0F0F5",
  textSecondary: "#A0A0B8",
  textMuted: "#6B6B80",
  textInverse: "#0F0F1A",

  // Accents
  accent: "#6C63FF",
  accentLight: "#9D97FF",
  success: "#4ADE80",
  warning: "#FBBF24",
  error: "#F87171",

  // Borders & dividers
  border: "#2A2A45",
  divider: "#1E1E35",

  // Reader mode backgrounds
  readerWhite: "#FEFEFE",
  readerSepia: "#F4ECD8",
  readerDark: "#1A1A2E",
  readerBlack: "#0A0A0A",
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  title: 28,
};

export const BorderRadius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

// Reader-specific settings
export const ReaderDefaults = {
  fontSize: 18,
  lineHeight: 1.8,
  fontFamily: undefined as string | undefined, // System default
};
