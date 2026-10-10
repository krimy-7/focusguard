import { useSyncExternalStore } from 'react';
import { Platform, useColorScheme, useWindowDimensions } from 'react-native';

// FocusGuard AI build tokens (.impeccable/surfaces/src-app.md). Same roles in light and dark.
// Colour is read with useTheme(); layout utilities stay in Tailwind classes.

export type WindowState = 'open' | 'wait' | 'paused' | 'private';
type Pane = { pane: string; leaf: string; stile: string };

const LIGHT = {
  dark: false,
  ink: '#2B1E17',
  ink2: '#5A4A40',
  ground: ['#E1E9E8', '#E8EBE4', '#EFE9DB'] as const,
  surface: '#F6F7F1',
  field: '#FBFBF7',
  rail: '#9A3E24',
  railInk: '#FBF6EC',
  brass: '#C8963E', // fills only, never text
  brassTint: '#F4E7C8',
  moss: '#4E6B3C',
  mossTint: '#E4ECDA',
  stone: '#E7E4DA',
  line: 'rgba(43,30,23,0.16)',
  danger: '#8C2A1A', // delete-account copy only
  onInk: '#FBF6EC',
  onMoss: '#FBF6EC',
  onDanger: '#FBF6EC',
  placeholder: '#6A5B51',
  frame: '#2B1E17',
  slat: { slat: '#2B1E17', groove: '#6E5445', peg: '#C8963E', fine: '#C8963E' },
  win: {
    open: { pane: '#E4ECDA', leaf: '#CFDDBF', stile: '#4E6B3C' },
    wait: { pane: '#F4E7C8', leaf: '#EBD6A0', stile: '#C8963E' },
    paused: { pane: '#E7E4DA', leaf: '#D9D5C9', stile: '#8B7D70' },
    private: { pane: '#2B1E17', leaf: '#2B1E17', stile: '#C8963E' },
  } satisfies Record<WindowState, Pane>,
};

export type Theme = Omit<typeof LIGHT, 'dark' | 'ground'> & { dark: boolean; ground: readonly [string, string, string] };

const DARK: Theme = {
  dark: true,
  ink: '#EFE9DB',
  ink2: '#C9BFB2',
  ground: ['#1A1310', '#1E1612', '#231913'],
  surface: '#2B1E17',
  field: '#33251D',
  rail: '#6E2A17',
  railInk: '#FBF6EC',
  brass: '#D4A24E',
  brassTint: '#3A2C1A',
  moss: '#86A86F',
  mossTint: '#23301C',
  stone: '#3A322B',
  line: 'rgba(239,233,219,0.16)',
  danger: '#F0A08F',
  onInk: '#1A1310',
  onMoss: '#1A1310',
  onDanger: '#2B1E17',
  placeholder: '#A89C8F',
  frame: '#0E0906',
  slat: { slat: '#120C09', groove: '#7A6253', peg: '#D4A24E', fine: '#D4A24E' },
  win: {
    open: { pane: '#23301C', leaf: '#33452A', stile: '#86A86F' },
    wait: { pane: '#3A2C1A', leaf: '#5B4521', stile: '#D4A24E' },
    paused: { pane: '#3A322B', leaf: '#4A4137', stile: '#7C6F63' },
    private: { pane: '#120C09', leaf: '#120C09', stile: '#D4A24E' },
  },
};

// On web, read prefers-color-scheme directly: NativeWind (darkMode 'class') takes over Appearance there and stops
// reporting system changes. Native uses the platform scheme.
const darkQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const subscribeDark = (cb: () => void) => {
  darkQuery?.addEventListener('change', cb);
  return () => darkQuery?.removeEventListener('change', cb);
};

export function useTheme(): Theme {
  const native = useColorScheme();
  const web = useSyncExternalStore(subscribeDark, () => darkQuery?.matches ?? false, () => false);
  return (Platform.OS === 'web' ? web : native === 'dark') ? DARK : LIGHT;
}

/** Wide screens get the brick side rail; narrow ones get the top bar and bottom tabs. */
export function useLayout() {
  const { width } = useWindowDimensions();
  return { width, wide: width >= 960 };
}

// ---- type: Mukta for everything FocusGuard says, Kalam only for the user's own words. Both cover Devanagari.
// Fonts are bundled (@expo-google-fonts); the web stack lets the system font show until they swap in.
const web = Platform.OS === 'web';
const stack = (name: string) => (web ? `${name}, "Nirmala UI", system-ui, "Segoe UI", sans-serif` : name);

export const FONT_NAMES = {
  regular: 'Mukta_400Regular',
  medium: 'Mukta_500Medium',
  semi: 'Mukta_600SemiBold',
  bold: 'Mukta_700Bold',
  hand: 'Kalam_400Regular',
  handBold: 'Kalam_700Bold',
} as const;

export const Font = {
  regular: stack(FONT_NAMES.regular),
  medium: stack(FONT_NAMES.medium),
  semi: stack(FONT_NAMES.semi),
  bold: stack(FONT_NAMES.bold),
  hand: stack(FONT_NAMES.hand),
  handBold: stack(FONT_NAMES.handBold),
};

// Scale: 14 / 16 / 18 / 22 / 28 / 44. Ranked by weight and size, nothing below 14.
export const TYPE = {
  display: { fontFamily: Font.bold, fontSize: 44, lineHeight: 50, letterSpacing: -0.44 },
  displaySm: { fontFamily: Font.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.2 },
  title: { fontFamily: Font.bold, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: Font.bold, fontSize: 22, lineHeight: 28 },
  lead: { fontFamily: Font.medium, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: Font.regular, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: Font.semi, fontSize: 16, lineHeight: 22 },
  small: { fontFamily: Font.regular, fontSize: 14, lineHeight: 20 },
  smallBold: { fontFamily: Font.semi, fontSize: 14, lineHeight: 20 },
  hand: { fontFamily: Font.hand, fontSize: 22, lineHeight: 30 },
  handField: { fontFamily: Font.hand, fontSize: 18, lineHeight: 26 },
} as const;

export type TypeVariant = keyof typeof TYPE;

export const RADIUS = { frame: 4, control: 10, chip: 6 } as const;

/** Soft, offset shadow (used only by the undo snackbar). */
export const LIFT = Platform.select({
  web: { boxShadow: '0 8px 20px rgba(43,30,23,0.28)' },
  default: { shadowColor: '#2B1E17', shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
