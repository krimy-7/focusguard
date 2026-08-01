import { DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import '@/global.css';

import { consumeBeastBlock } from '../../modules/focusguard-usage';

import { Palette } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_700Bold: require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
    PlusJakartaSans_800ExtraBold: require('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'),
    BeVietnamPro_400Regular: require('@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf'),
    BeVietnamPro_500Medium: require('@expo-google-fonts/be-vietnam-pro/500Medium/BeVietnamPro_500Medium.ttf'),
    BeVietnamPro_600SemiBold: require('@expo-google-fonts/be-vietnam-pro/600SemiBold/BeVietnamPro_600SemiBold.ttf'),
    BeVietnamPro_700Bold: require('@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        consumeBeastBlock().then((pkg) => {
          if (pkg) router.replace(`/beast-block?app=${encodeURIComponent(pkg)}`);
        });
      }
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

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

  return (
    <ThemeProvider value={routerTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="beast-block" />
      </Stack>
    </ThemeProvider>
  );
}
