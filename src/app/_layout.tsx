import { DefaultTheme, Stack, ThemeProvider, useRouter, type Href } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import '@/global.css';

import { useSession } from '@/lib/supabase';
import { Palette } from '@/theme';

SplashScreen.preventAutoHideAsync();

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
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_700Bold: require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
    PlusJakartaSans_800ExtraBold: require('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'),
    BeVietnamPro_400Regular: require('@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf'),
    BeVietnamPro_500Medium: require('@expo-google-fonts/be-vietnam-pro/500Medium/BeVietnamPro_500Medium.ttf'),
    BeVietnamPro_600SemiBold: require('@expo-google-fonts/be-vietnam-pro/600SemiBold/BeVietnamPro_600SemiBold.ttf'),
    BeVietnamPro_700Bold: require('@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf'),
  });
  const { loading, signedIn } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (fontsLoaded && !loading) SplashScreen.hideAsync();
  }, [fontsLoaded, loading]);

  // Runs after the commit that rendered the Stack with the signed-in guard, so the navigator is mounted.
  useEffect(() => {
    if (!fontsLoaded || loading || !signedIn || !pendingPath) return;
    const to = pendingPath;
    pendingPath = null;
    router.replace(to as Href);
  }, [fontsLoaded, loading, signedIn, router]);

  if (!fontsLoaded || loading) return null;

  const routerTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: Palette.primary,
      background: Palette.background,
      card: Palette.surface,
      text: Palette.onSurface,
      border: Palette.outlineVariant,
      notification: Palette.primary,
    },
  };

  // Client-side gate only (v57 protected-routes page); the backend verifies every token itself.
  return (
    <ThemeProvider value={routerTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
