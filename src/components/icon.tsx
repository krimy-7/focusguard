import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useThemeColors } from '@/hooks/use-theme-colors';

type IconProps = {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  size?: number;
  color?: string;
  style?: object;
};

export function Icon({ name, size = 24, color, style }: IconProps) {
  const theme = useThemeColors();
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={color ?? theme.onSurfaceVariant}
      allowFontScaling={false}
      style={style}
    />
  );
}
