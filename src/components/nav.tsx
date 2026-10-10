import type { ReactNode } from 'react';
import { Pressable, View, type PressableStateCallbackType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { LatticeWindow } from '@/components/brand';
import { Icon, type IconName } from '@/components/icon';
import { BrickRail } from '@/components/surfaces';
import { Font } from '@/theme';
import { webProps, webStyle } from '@/theme/web';

const CREAM = '#FBF6EC';
const WOOD = '#2B1E17';
type State = PressableStateCallbackType & { hovered?: boolean };

function Brand() {
  return (
    <View className="flex-row items-center gap-3">
      <LatticeWindow state="open" size="mark" />
      <AppText variant="lead" tone="cream" style={{ fontFamily: Font.bold }}>
        FocusGuard AI
      </AppText>
    </View>
  );
}

/** Slim brick header on narrow screens (the rail's brand, without the rail). */
export function BrandBar() {
  const insets = useSafeAreaInsets();
  return (
    <BrickRail role="banner" style={{ paddingTop: insets.top, paddingHorizontal: 16, height: 60 + insets.top, justifyContent: 'center' }}>
      <Brand />
    </BrickRail>
  );
}

/**
 * Rail (wide) or bottom tab bar (narrow). Rendered through <TabList asChild>, so `style` from the
 * tab list is ignored on purpose; the triggers arrive as children.
 */
export function Nav({ wide, children }: { wide: boolean; children: ReactNode; style?: unknown }) {
  const insets = useSafeAreaInsets();
  if (wide) {
    return (
      <BrickRail role="navigation" aria-label="Main" edge="right" style={{ width: 232, paddingVertical: 24, paddingHorizontal: 16, gap: 32 }}>
        <Brand />
        <View style={{ gap: 4 }}>{children}</View>
        <View style={{ marginTop: 'auto', paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(251,246,236,0.3)' }}>
          <AppText variant="small" tone="cream">
            Page titles and full addresses never leave your browser.
          </AppText>
        </View>
      </BrickRail>
    );
  }
  return (
    <BrickRail role="navigation" aria-label="Main" edge="top" style={{ flexDirection: 'row', gap: 4, paddingTop: 8, paddingHorizontal: 8, paddingBottom: Math.max(insets.bottom, 8) }}>
      {children}
    </BrickRail>
  );
}

type LinkProps = {
  label: string;
  icon: IconName;
  wide: boolean;
  // Supplied by <TabTrigger asChild>
  isFocused?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  href?: string;
};

export function NavLink({ label, icon, wide, isFocused, onPress, onLongPress, href }: LinkProps) {
  const active = { 'aria-current': isFocused ? 'page' : undefined } as object;
  const ink = isFocused ? WOOD : CREAM;
  return (
    <Pressable
      role="link"
      {...active}
      {...webProps({ href })}
      onPress={onPress}
      onLongPress={onLongPress}
      style={(s: State) => [
        {
          minHeight: wide ? 44 : 56,
          flex: wide ? undefined : 1,
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: wide ? 'flex-start' : 'center',
          gap: wide ? 12 : 2,
          paddingHorizontal: 12,
          borderRadius: 8,
          backgroundColor: isFocused ? CREAM : s.hovered || s.pressed ? 'rgba(255,255,255,0.14)' : 'transparent',
        },
        webStyle({ cursor: 'pointer', transitionProperty: 'background-color', transitionDuration: '150ms' }),
      ]}>
      <Icon name={icon} size={wide ? 20 : 22} color={ink} />
      <AppText
        variant={wide ? 'label' : 'small'}
        style={{
          color: ink,
          ...(isFocused ? null : webStyle({ textShadow: '0 1px 0 rgba(43,30,23,0.35)' })),
        }}>
        {label}
      </AppText>
    </Pressable>
  );
}
