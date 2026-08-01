import { Platform } from 'react-native';

export const Palette = {
  primary: '#5e41d0',
  onPrimary: '#ffffff',
  primaryContainer: '#775ceb',
  onPrimaryContainer: '#fffbff',
  primaryFixed: '#e6deff',
  onPrimaryFixed: '#1c0062',
  onPrimaryFixedVariant: '#4825ba',
  primaryFixedDim: '#cabeff',
  inversePrimary: '#cabeff',
  secondary: '#006a66',
  onSecondary: '#ffffff',
  secondaryContainer: '#6cf4ed',
  onSecondaryContainer: '#006f6a',
  secondaryFixed: '#6ff7f0',
  secondaryFixedDim: '#4ddad3',
  onSecondaryFixed: '#00201e',
  onSecondaryFixedVariant: '#00504d',
  tertiary: '#745c00',
  onTertiary: '#ffffff',
  tertiaryContainer: '#cfa605',
  onTertiaryContainer: '#4e3d00',
  tertiaryFixed: '#ffe089',
  tertiaryFixedDim: '#edc22e',
  onTertiaryFixed: '#241a00',
  onTertiaryFixedVariant: '#574500',
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  surface: '#fcf8ff',
  onSurface: '#1a1a27',
  surfaceDim: '#dad8e9',
  surfaceBright: '#fcf8ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f5f2ff',
  surfaceContainer: '#eeecfe',
  surfaceContainerHigh: '#e9e6f8',
  surfaceContainerHighest: '#e3e0f2',
  surfaceVariant: '#e3e0f2',
  onSurfaceVariant: '#484554',
  background: '#fcf8ff',
  onBackground: '#1a1a27',
  outline: '#797586',
  outlineVariant: '#c9c4d7',
  surfaceTint: '#6043d3',
  inverseSurface: '#2f2f3c',
  inverseOnSurface: '#f2efff',
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
    boxShadow:
      'inset 0 2px 4px rgba(255, 255, 255, 0.4), 0 10px 40px -12px rgba(94, 65, 208, 0.12)',
  },
  default: {
    shadowColor: '#5e41d0',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
});
