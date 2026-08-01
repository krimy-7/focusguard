import { View, type ViewProps } from 'react-native';

import { cn, BG_COLORS, BORDER_COLORS, type TwColorName } from '@/theme/tailwind';
import { CardShadow } from '@/theme';

const RADIUS_CLASSES: Record<number, string> = {
  12: 'rounded-[12px]',
  16: 'rounded-[16px]',
  20: 'rounded-[20px]',
  24: 'rounded-[24px]',
  32: 'rounded-[32px]',
  999: 'rounded-full',
};

type CardProps = ViewProps & {
  surface?: TwColorName;
  border?: TwColorName;
  borderWidth?: number;
  radius?: number;
  shadow?: boolean;
};

export function Card({
  surface = 'surface-container-lowest',
  border,
  borderWidth,
  radius = 24,
  shadow = true,
  className,
  style,
  ...rest
}: CardProps) {
  return (
    <View
      className={cn(
        BG_COLORS[surface],
        RADIUS_CLASSES[radius] ?? 'rounded-[24px]',
        'border border-outline-variant/70',
        border && BORDER_COLORS[border],
        border && (borderWidth === 2 ? 'border-2' : 'border'),
        className,
      )}
      style={[shadow && CardShadow, style]}
      {...rest}
    />
  );
}
