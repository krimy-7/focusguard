import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { MascotAvatar } from '@/components/mascot';

type EmptyStateProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, subtitle, action }: EmptyStateProps) {
  return (
    <View className="items-center py-xl px-lg gap-sm">
      <MascotAvatar size={64} />
      <AppText variant="headlineMd" className="text-center">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="bodyMd" color="on-surface-variant" className="text-center">
          {subtitle}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}
