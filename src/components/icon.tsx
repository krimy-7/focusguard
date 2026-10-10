import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/theme';

// Authored 24px line icons, one stroke weight (2, round caps).
const ICONS = {
  today: (
    <>
      <Circle cx="12" cy="12" r="4" />
      <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  history: (
    <>
      <Path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <Path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  settings: (
    <>
      <Path d="M4 6h8M16 6h4M4 12h4M12 12h8M4 18h10M18 18h2" />
      <Circle cx="14" cy="6" r="2" />
      <Circle cx="10" cy="12" r="2" />
      <Circle cx="16" cy="18" r="2" />
    </>
  ),
  arrow: <Path d="M5 12h14M13 6l6 6-6 6" />,
  external: <Path d="M7 17L17 7M8 7h9v9" />,
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  check: <Path d="M5 12.5l4.5 4.5L19 7" />,
  info: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 11v5M12 7.6v.01" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

/** Decorative: hidden from assistive tech (the control that holds it carries the label). */
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants" style={{ pointerEvents: 'none' }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? t.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name]}
      </Svg>
    </View>
  );
}
