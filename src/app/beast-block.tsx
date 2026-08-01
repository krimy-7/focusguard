import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { api } from '@/lib/api';
import { Palette } from '@/theme';

import { getLaunchableApps, stopBeastGuard } from '../../modules/focusguard-usage';

export default function BeastBlockScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ app?: string }>();
  const blockedPkg = params.app ?? '';
  const [appName, setAppName] = useState(blockedPkg);

  useEffect(() => {
    if (!blockedPkg) return;
    getLaunchableApps().then((apps) => {
      const match = apps.find((a) => a.package === blockedPkg);
      if (match) setAppName(match.name);
    });
  }, [blockedPkg]);

  const endBeast = useCallback(async () => {
    await stopBeastGuard();
    await api.stopBeast();
    router.replace('/');
  }, []);

  const backToFocus = useCallback(() => {
    router.replace('/');
  }, []);

  return (
    <View className="flex-1 bg-error-container" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="flex-1 items-center justify-center px-lg gap-md">
        <View className="bg-error rounded-full p-lg">
          <Icon name="fire" size={40} color={Palette.onErrorContainer} />
        </View>
        <AppText variant="headlineLg" color="on-error-container" className="text-center">
          Beast Mode
        </AppText>
        <AppText variant="bodyLg" color="on-error-container" className="text-center">
          {appName ? `${appName} is locked for now.` : 'That app is locked for now.'}
        </AppText>
        <AppText variant="bodyMd" color="on-error-container" className="text-center">
          Get back to what matters — your focus wins.
        </AppText>

        <Pressable
          onPress={backToFocus}
          className="bg-primary rounded-full px-xl py-sm items-center active:opacity-85 self-stretch">
          <AppText variant="labelLg" color="on-primary">
            Back to focus
          </AppText>
        </Pressable>
        <Pressable
          onPress={endBeast}
          className="bg-error rounded-full px-xl py-sm items-center active:opacity-85 self-stretch border border-error">
          <AppText variant="labelLg" color="on-error">
            End Beast Mode
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
