import { View, type ViewProps } from 'react-native';

import { cn, BG_COLORS, BORDER_COLORS, type TwColorName } from '@/theme/tailwind';

const RADIUS_CLASSES: Record<number, string> = {
  12: 'rounded-[12px]',
  16: 'rounded-[16px]',
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
  ...rest
}: CardProps) {
  return (
    <View
      className={cn(
        BG_COLORS[surface],
        RADIUS_CLASSES[radius] ?? 'rounded-[24px]',
        border && BORDER_COLORS[border],
        border && (borderWidth === 2 ? 'border-2' : 'border'),
        shadow && 'shadow-sm',
        className,
      )}
      {...rest}
    />
  );
}
