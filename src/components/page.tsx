import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout, useTheme } from '@/theme';

/** One reading column (720px max) on the ground. Pull to refresh on native. */
export function Page({ children, refreshing, onRefresh }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  const t = useTheme();
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ alignItems: 'center', paddingHorizontal: wide ? 56 : 20, paddingTop: wide ? 56 : 28, paddingBottom: 72 + insets.bottom }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.ink} /> : undefined}
      showsVerticalScrollIndicator={false}>
      <View style={{ width: '100%', maxWidth: 720, gap: wide ? 40 : 32 }}>{children}</View>
    </ScrollView>
  );
}
