import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, type Href } from 'expo-router';
import { FontDisplay, useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import '@/global.css';

import { Ground } from '@/components/surfaces';
import { useSession } from '@/lib/supabase';
import { FONT_NAMES, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();

// Mukta (FocusGuard's words) and Kalam (the user's own), both with Devanagari, bundled in the app.
// display: swap, so text shows in the system font at once and swaps when these arrive.
const swap = (uri: number) => ({ uri, display: FontDisplay.SWAP });
const FONTS = {
  [FONT_NAMES.regular]: swap(require('@expo-google-fonts/mukta/400Regular/Mukta_400Regular.ttf')),
  [FONT_NAMES.medium]: swap(require('@expo-google-fonts/mukta/500Medium/Mukta_500Medium.ttf')),
  [FONT_NAMES.semi]: swap(require('@expo-google-fonts/mukta/600SemiBold/Mukta_600SemiBold.ttf')),
  [FONT_NAMES.bold]: swap(require('@expo-google-fonts/mukta/700Bold/Mukta_700Bold.ttf')),
  [FONT_NAMES.hand]: swap(require('@expo-google-fonts/kalam/400Regular/Kalam_400Regular.ttf')),
  [FONT_NAMES.handBold]: swap(require('@expo-google-fonts/kalam/700Bold/Kalam_700Bold.ttf')),
};

// Index R30: the extension links to ${DASHBOARD_URL}/settings. A signed-out visitor is redirected to
// sign-in, and the guard flip would land them on Today, so remember the requested tab from the URL
// the page was opened with and go there once signed in.
// ponytail: module memory only, so the Google redirect (full page reload to the origin) lands on Today;
// move it to sessionStorage if that path matters.
const DEEP_LINKS = ['/history', '/settings'];
let pendingPath: string | null =
  Platform.OS === 'web' && typeof window !== 'undefined' && DEEP_LINKS.includes(window.location.pathname)
    ? window.location.pathname
    : null;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONTS);
  const { loading, signedIn } = useSession();
  const router = useRouter();
  const t = useTheme();

  // Never wait on fonts for long: after 2.5 s the splash goes away and the system font carries on.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError || waited) && !loading) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError, waited, loading]);

  // Runs after the commit that rendered the Stack with the signed-in guard, so the navigator is mounted.
  useEffect(() => {
    if (loading || !signedIn || !pendingPath) return;
    const to = pendingPath;
    pendingPath = null;
    router.replace(to as Href);
  }, [loading, signedIn, router]);

  // Google sends the browser back with ?code=...; supabase-js has exchanged it once the session has loaded,
  // so drop it from the address bar (and from history) instead of leaving a spent code in the URL.
  useEffect(() => {
    if (Platform.OS !== 'web' || loading) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('code')) return;
    url.searchParams.delete('code');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, [loading]);

  if (loading) return null;

  const base = t.dark ? DarkTheme : DefaultTheme;
  const routerTheme = {
    ...base,
    colors: { ...base.colors, primary: t.ink, background: 'transparent', card: t.surface, text: t.ink, border: t.line, notification: t.brass },
  };

  // Client-side gate only (v57 protected-routes page); the backend verifies every token itself.
  return (
    <Ground>
      <ThemeProvider value={routerTheme}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </Ground>
  );
}
