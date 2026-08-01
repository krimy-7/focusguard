import { View, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { Palette } from '@/theme';

export function MascotAvatar({ size = 40, style }: { size?: number; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.34,
          backgroundColor: Palette.primaryContainer,
        },
        style,
      ]}
      className="items-center justify-center overflow-hidden">
      <Icon name="creation" size={size * 0.5} color={Palette.primary} />
    </View>
  );
}
