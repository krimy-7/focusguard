import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { cn, type TwColorName } from '@/theme/tailwind';
import type { Mode } from '@/lib/types';

const MODE_META: Record<Mode, { label: string; chip: TwColorName; text: TwColorName }> = {
  learning: { label: 'Learning', chip: 'tertiary-container', text: 'on-tertiary-container' },
  work: { label: 'Work', chip: 'primary-container', text: 'on-primary-container' },
  personal: { label: 'Personal', chip: 'secondary-container', text: 'on-secondary-container' },
};

export function ModePill({ mode, className }: { mode: Mode; className?: string }) {
  const meta = MODE_META[mode] ?? MODE_META.work;
  return (
    <View className={cn('px-sm py-[2px] rounded-full self-start', `bg-${meta.chip}`, className)}>
      <AppText variant="labelSm" color={meta.text}>
        {meta.label}
      </AppText>
    </View>
  );
}

export const MODES: Mode[] = ['work', 'learning', 'personal'];
export { MODE_META };
