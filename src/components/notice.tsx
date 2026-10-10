import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { RADIUS, useTheme } from '@/theme';

/**
 * A calm inline message. Nothing here is ever red: stone for information (offline, signed out),
 * brass tint for "that didn't work, here is what to do". Danger red lives only in the delete zone.
 */
export function Notice({ tone = 'info', urgent = false, children, action }: { tone?: 'info' | 'try'; urgent?: boolean; children: ReactNode; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      className="flex-row flex-wrap items-center gap-x-3 gap-y-2"
      style={{ backgroundColor: tone === 'try' ? t.brassTint : t.stone, borderRadius: RADIUS.chip, paddingVertical: 12, paddingHorizontal: 16 }}>
      <View className="flex-row items-center gap-3" style={{ flexShrink: 1, flexGrow: 1, flexBasis: 220 }}>
        <Icon name="info" size={20} />
        <AppText variant="small" style={{ flex: 1 }}>
          {children}
        </AppText>
      </View>
      {action}
    </View>
  );
}
