import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';
import { BRICK_SVG, GRAIN_SVG, PLASTER_SVG, svgUrl } from '@/theme/textures';
import { webProps, webStyle } from '@/theme/web';

/** Lime-wash ground: the cool-to-warm gradient under plaster grain. Native gets the flat middle tone. */
export function Ground({ children }: { children: ReactNode }) {
  const t = useTheme();
  const [a, b, c] = t.ground;
  return (
    <View
      style={[
        { flex: 1, backgroundColor: b },
        webStyle({ backgroundImage: `${svgUrl(PLASTER_SVG)}, linear-gradient(160deg, ${a} 0%, ${b} 44%, ${c} 100%)` }),
      ]}>
      {children}
    </View>
  );
}

/**
 * Fired-brick coursing (brick.svg) under fired-clay grain (grain.svg, multiply), never a flat fill.
 * Dark scheme adds a soft shade so cream text stays above 5:1. Native falls back to the flat brick colour.
 * `edge` adds the soft inner shadow on the content-facing side.
 */
export function BrickRail({ edge, style, children, ...rest }: ViewProps & { edge?: 'right' | 'top'; children?: ReactNode }) {
  const t = useTheme();
  const shade = t.dark ? 'linear-gradient(rgba(30,10,4,0.34),rgba(30,10,4,0.34)), ' : '';
  const inset = edge === 'right' ? 'inset -6px 0 10px -6px rgba(43,30,23,0.55)' : edge === 'top' ? 'inset 0 6px 10px -6px rgba(43,30,23,0.55)' : 'none';
  return (
    <View
      {...webProps({ dataSet: { rail: '1' } })}
      {...rest}
      style={[
        { backgroundColor: t.rail },
        webStyle({
          backgroundColor: '#9A3E24',
          backgroundImage: `${shade}${svgUrl(GRAIN_SVG)}, ${svgUrl(BRICK_SVG)}`,
          backgroundSize: `${t.dark ? 'auto, ' : ''}180px 180px, 96px 40px`,
          backgroundBlendMode: `${t.dark ? 'normal, ' : ''}multiply, normal`,
          boxShadow: inset,
        }),
        style,
      ]}>
      {children}
    </View>
  );
}

