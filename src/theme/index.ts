import { Platform } from 'react-native';

// A quiet, high-contrast workspace palette: ink surfaces and a single teal signal.
// The supportive colors stay deliberately muted so focus states always read first.
export const Palette = {
  primary: '#0f766e',
  onPrimary: '#ffffff',
  primaryContainer: '#ccfbf1',
  onPrimaryContainer: '#134e4a',
  primaryFixed: '#ccfbf1',
  onPrimaryFixed: '#134e4a',
  onPrimaryFixedVariant: '#0f766e',
  primaryFixedDim: '#99f6e4',
  inversePrimary: '#5eead4',
  secondary: '#475569',
  onSecondary: '#ffffff',
  secondaryContainer: '#e2e8f0',
  onSecondaryContainer: '#334155',
  secondaryFixed: '#e2e8f0',
  secondaryFixedDim: '#cbd5e1',
  onSecondaryFixed: '#1e293b',
  onSecondaryFixedVariant: '#475569',
  tertiary: '#7c5c2f',
  onTertiary: '#ffffff',
  tertiaryContainer: '#fef3c7',
  onTertiaryContainer: '#78350f',
  tertiaryFixed: '#fef3c7',
  tertiaryFixedDim: '#fde68a',
  onTertiaryFixed: '#451a03',
  onTertiaryFixedVariant: '#92400e',
  error: '#dc2626',
  onError: '#ffffff',
  errorContainer: '#fee2e2',
  onErrorContainer: '#991b1b',
  surface: '#f8fafc',
  onSurface: '#0f172a',
  surfaceDim: '#e2e8f0',
  surfaceBright: '#ffffff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f1f5f9',
  surfaceContainer: '#eaf0f5',
  surfaceContainerHigh: '#e2e8f0',
  surfaceContainerHighest: '#cbd5e1',
  surfaceVariant: '#e2e8f0',
  onSurfaceVariant: '#64748b',
  background: '#f8fafc',
  onBackground: '#0f172a',
  outline: '#94a3b8',
  outlineVariant: '#dbe4ee',
  surfaceTint: '#0f766e',
  inverseSurface: '#0f172a',
  inverseOnSurface: '#f8fafc',
} as const;

export type PaletteColor = keyof typeof Palette;

export type ThemeColors = typeof Palette;

export const Fonts = {
  headline: 'PlusJakartaSans_800ExtraBold',
  headlineSemibold: 'PlusJakartaSans_700Bold',
  body: 'BeVietnamPro_400Regular',
  bodyMedium: 'BeVietnamPro_500Medium',
  bodySemiBold: 'BeVietnamPro_600SemiBold',
  bodyBold: 'BeVietnamPro_700Bold',
};

export const Typography = {
  headlineXl: {
    fontFamily: Fonts.headline,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.8,
  },
  headlineLg: {
    fontFamily: Fonts.headline,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.4,
  },
  headlineLgMobile: {
    fontFamily: Fonts.headline,
    fontSize: 26,
    lineHeight: 32,
  },
  headlineMd: {
    fontFamily: Fonts.headlineSemibold,
    fontSize: 24,
    lineHeight: 30,
  },
  bodyLg: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 18,
    lineHeight: 28,
  },
  bodyMd: {
    fontFamily: Fonts.body,
    fontSize: 16,
    lineHeight: 24,
  },
  labelLg: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.28,
  },
  labelSm: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
} as const;

export type TypographyVariant = keyof typeof Typography;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  gutter: 12,
  containerPadding: 20,
} as const;

export const Radius = {
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

// Shared ScrollView content container: keeps the phone-first layout readable
// on wide screens (web/tablet) by capping the column width and centering it.
export const ScreenContent = {
  width: '100%',
  maxWidth: 560,
  alignSelf: 'center',
  paddingHorizontal: Spacing.containerPadding,
  paddingTop: Spacing.md,
  paddingBottom: Spacing.xl,
  gap: Spacing.lg,
} as const;

export const CardShadow = Platform.select({
  web: {
    boxShadow: '0 12px 32px -18px rgba(15, 23, 42, 0.18)',
  },
  default: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
});
