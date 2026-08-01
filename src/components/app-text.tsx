import { Text, type TextProps } from 'react-native';

import { cn, TEXT_COLORS, type TwColorName } from '@/theme/tailwind';
import type { TypographyVariant } from '@/theme';

const VARIANT_CLASSES: Record<TypographyVariant, string> = {
  headlineXl: 'font-headline text-headline-xl',
  headlineLg: 'font-headline text-headline-lg',
  headlineLgMobile: 'font-headline text-headline-lg-mobile',
  headlineMd: 'font-headline-semibold text-headline-md',
  bodyLg: 'font-body-medium text-body-lg',
  bodyMd: 'font-body text-body-md',
  labelLg: 'font-body-bold text-label-lg',
  labelSm: 'font-body-semi text-label-sm',
};

type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: TwColorName;
};

export function AppText({ variant = 'bodyMd', color = 'on-surface', className, ...rest }: AppTextProps) {
  return (
    <Text className={cn(VARIANT_CLASSES[variant], TEXT_COLORS[color], className)} {...rest} />
  );
}
