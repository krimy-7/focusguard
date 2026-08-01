import { Text, type TextProps } from 'react-native';

import { cn, TEXT_COLORS, type TwColorName } from '@/theme/tailwind';

type AppTextTinyProps = TextProps & {
  color?: TwColorName;
};

export function AppTextTiny({   color = 'on-surface', className, ...rest }: AppTextTinyProps) {
  return (
    <Text className={cn('font-body-semi text-label-sm', TEXT_COLORS[color], className)} {...rest} />
  );
}
