import type { ReactNode } from 'react';
import { Pressable, View, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { RADIUS, useTheme } from '@/theme';
import { webStyle } from '@/theme/web';

type Tone = 'primary' | 'quiet' | 'danger';
type State = PressableStateCallbackType & { hovered?: boolean };

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: Tone;
  /** 'link' for buttons that leave the app (announced as a link). */
  role?: 'button' | 'link';
  icon?: IconName;
  /** Custom leading mark (e.g. the Google G). */
  lead?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** 44px minimum target. Filled = the one primary action; outlined = everything else. */
export function Button({ label, onPress, disabled = false, tone = 'primary', role = 'button', icon, lead, accessibilityLabel, style }: Props) {
  const t = useTheme();
  const fill = { primary: t.ink, quiet: 'transparent', danger: t.danger }[tone];
  const text = { primary: t.onInk, quiet: t.ink, danger: t.onDanger }[tone];
  const border = tone === 'danger' ? t.danger : t.ink;
  return (
    <Pressable
      role={role}
      accessibilityLabel={accessibilityLabel ?? label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={(s: State) => [
        {
          minHeight: 44,
          paddingHorizontal: 16,
          borderRadius: RADIUS.control,
          borderWidth: 1.5,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          alignSelf: 'flex-start',
        },
        disabled
          ? { backgroundColor: t.stone, borderColor: 'transparent' }
          : {
              backgroundColor: fill,
              borderColor: border,
              opacity: s.pressed ? 0.8 : s.hovered ? 0.9 : 1,
            },
        !disabled && tone === 'quiet' && s.hovered ? { backgroundColor: `${t.ink}14` } : null,
        webStyle({ cursor: disabled ? 'not-allowed' : 'pointer', transitionProperty: 'background-color, opacity', transitionDuration: '150ms' }),
        style,
      ]}>
      {lead ? <View aria-hidden>{lead}</View> : null}
      <AppText variant="label" style={{ color: disabled ? t.ink2 : text, lineHeight: 20 }}>
        {label}
      </AppText>
      {icon ? <Icon name={icon} size={18} color={disabled ? t.ink2 : text} /> : null}
    </Pressable>
  );
}
