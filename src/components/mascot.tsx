import { View, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';

export function MascotAvatar({ size = 40, style }: { size?: number; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
      className="bg-primary-container border-2 border-primary-fixed items-center justify-center overflow-hidden">
      <Icon name="creation" size={size * 0.5} color="#ffffff" />
    </View>
  );
}
