import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
import { MascotAvatar } from '@/components/mascot';
import { Icon } from '@/components/icon';
import { useThemeColors } from '@/hooks/use-theme-colors';

export function TopAppBar({ onSettings }: { onSettings?: () => void }) {
  const theme = useThemeColors();
  return (
    <View className="flex-row items-center justify-between px-container-padding py-md bg-surface">
      <View className="flex-row items-center gap-sm">
        <MascotAvatar />
        <AppText variant="headlineMd" color="primary">
          FocusGuard
        </AppText>
      </View>
      <Pressable
        accessibilityLabel="Settings"
        hitSlop={8}
        className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
        onPress={onSettings ?? (() => router.push('/settings'))}>
        <Icon name="cog-outline" color={theme.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}
