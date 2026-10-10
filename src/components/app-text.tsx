import { Text, type TextProps } from 'react-native';

import { TYPE, useTheme, type TypeVariant } from '@/theme';
import { webStyle } from '@/theme/web';

type Tone = 'ink' | 'ink2' | 'danger' | 'onInk' | 'cream';

type Props = TextProps & {
  variant?: TypeVariant;
  tone?: Tone;
  /** Renders a real heading (h1 to h3 on web, header role on native). */
  level?: 1 | 2 | 3;
};

/** All FocusGuard text. Colour comes from the theme tokens, size and family from the type scale. */
export function AppText({ variant = 'body', tone = 'ink', level, style, ...rest }: Props) {
  const t = useTheme();
  const colour = { ink: t.ink, ink2: t.ink2, danger: t.danger, onInk: t.onInk, cream: t.railInk }[tone];
  const heading = level ? ({ role: 'heading', 'aria-level': level } as TextProps) : null;
  return (
    <Text
      {...heading}
      {...rest}
      style={[TYPE[variant], { color: colour }, level ? webStyle({ textWrap: 'balance' }) : null, style]}
    />
  );
}
