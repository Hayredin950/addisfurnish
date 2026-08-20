/**
 * HabeshaHome design tokens — matches the web app palette exactly (terracotta
 * #AC451B primary on warm cream #F5EEE2), so both apps share the same brand.
 */
export const colors = {
  primary: "#AC451B",
  primaryDark: "#7C2D12",
  primaryLight: "#F5EEE2",
  onPrimary: "#FFFFFF",

  accent: "#7C2D12",

  background: "#FBF7F0",
  card: "#FFFFFF",
  cardPressed: "#F5EEE2",
  secondary: "#F3EBDE",
  secondaryForeground: "#5C4A33",

  text: "#26221C",
  textMuted: "#8C7E6C",
  textSoft: "#B4A796",

  border: "#E6DCCB",
  borderStrong: "#D8C9B2",

  success: "#2E7D4F",
  successLight: "#E3F2E8",
  danger: "#C0392B",
  dangerLight: "#FBE9E6",
  warning: "#B7791F",
  warningLight: "#FBF0D9",

  info: "#3B6EA5",
  infoLight: "#E7F0F9",

  overlay: "rgba(38, 34, 28, 0.45)",
  tabBar: "#FFFFFF",
  tabBarBorder: "#E6DCCB",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
} as const;

export const font = {
  display: {
    fontFamily: "Georgia, serif",
    fontWeight: "600" as const,
  },
  heading: {
    fontWeight: "700" as const,
  },
  body: {
    fontWeight: "400" as const,
  },
};

export const shadows = {
  card: {
    shadowColor: "#5C4A33",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  floating: {
    shadowColor: "#26221C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;
