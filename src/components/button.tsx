import { Pressable } from 'react-native';

import { AppText } from '@/components/app-text';
import { cn } from '@/theme/tailwind';

type Tone = 'primary' | 'quiet' | 'danger';

const BG: Record<Tone, string> = {
  primary: 'bg-primary',
  quiet: 'bg-surface-container-high',
  danger: 'bg-error',
};
const FG = { primary: 'on-primary', quiet: 'on-surface', danger: 'on-error' } as const;

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: Tone;
  accessibilityLabel?: string;
  className?: string;
};

/** 44 px minimum target, button role, disabled state announced. */
export function Button({ label, onPress, disabled = false, tone = 'primary', accessibilityLabel, className }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-[44px] px-lg rounded-full items-center justify-center active:opacity-85',
        disabled ? 'bg-surface-container-high opacity-60' : BG[tone],
        className,
      )}>
      <AppText variant="labelLg" color={disabled ? 'on-surface-variant' : FG[tone]}>
        {label}
      </AppText>
    </Pressable>
  );
}
