import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { LatticeWindow } from '@/components/brand';

/** A page-level message with the Yeti at a closed window. The title is the page's h1. */
export function EmptyState({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <View className="items-center gap-4 py-10">
      <LatticeWindow state="paused" size="md" />
      <AppText variant="title" level={1} style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText tone="ink2" style={{ textAlign: 'center', maxWidth: 440 }}>
          {subtitle}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}
