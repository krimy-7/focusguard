import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, Pattern, Rect } from 'react-native-svg';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { RADIUS, useTheme, type WindowState } from '@/theme';
import { isWeb } from '@/theme/web';

/**
 * The Yeti: a calm companion, bust view. Same geometry as the canonical extension/brand/yeti.svg
 * (the fur group is drawn twice, ink outline under cream fill, instead of using <use>).
 */
function Fur() {
  return (
    <>
      <Ellipse cx="32" cy="31" rx="19.5" ry="17.5" />
      <Path d="M21 19Q19 12 25 8Q26.5 13 31 15Z" />
      <Path d="M26 15Q27.5 8 32.5 4.5Q37.5 8 38 15Z" />
      <Path d="M34 15Q37.5 10 42 8Q45 12 43 19Z" />
      <Path d="M14.5 27Q8.5 36 10.5 49Q17 47 20 40Z" />
      <Path d="M49.5 27Q55.5 36 53.5 49Q47 47 44 40Z" />
      <Ellipse cx="32" cy="62" rx="26" ry="15" />
      <Path d="M9 53Q3 59 5 67L18 67Z" />
      <Path d="M55 53Q61 59 59 67L46 67Z" />
    </>
  );
}

export function YetiMark({ size = 40 }: { size?: number }) {
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants" style={{ pointerEvents: 'none' }}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <G fill="#2B1E17" stroke="#2B1E17" strokeWidth={3.4} strokeLinejoin="round">
          <Fur />
        </G>
        <G fill="#F7F4EC" stroke="#F7F4EC" strokeWidth={1.6} strokeLinejoin="round">
          <Fur />
        </G>
        <Path d="M12.5 40q1 4 3 6.5M51.5 40q-1 4-3 6.5M28 8.5q1 2.5 3 4M37 8.5q-1 2.5-3 4M14 57q3 2 5 8M50 57q-3 2-5 8" fill="none" stroke="#CBC4B3" strokeWidth={1.1} strokeLinecap="round" />
        <Path d="M32 19.5C41.5 19.5 48 25.5 48 33.5C48 41.5 41.5 47.5 32 47.5C22.5 47.5 16 41.5 16 33.5C16 25.5 22.5 19.5 32 19.5Z" fill="#D9E4E4" />
        <Path d="M19.5 28.5Q26 22.5 31.5 27M32.5 27Q38 22.5 44.5 28.5" fill="none" stroke="#F7F4EC" strokeWidth={3.2} strokeLinecap="round" />
        <Path d="M22 29.5q4.5-3 8.5-.5M33.5 29q4-2.5 8.5.5" fill="none" stroke="#2B1E17" strokeWidth={1.5} strokeLinecap="round" />
        <Circle cx="26" cy="34" r="2.2" fill="#2B1E17" />
        <Circle cx="38" cy="34" r="2.2" fill="#2B1E17" />
        <Circle cx="26.8" cy="33.2" r=".75" fill="#fff" />
        <Circle cx="38.8" cy="33.2" r=".75" fill="#fff" />
        <Ellipse cx="21.5" cy="40" rx="3.2" ry="2.1" fill="#9A3E24" opacity={0.2} />
        <Ellipse cx="42.5" cy="40" rx="3.2" ry="2.1" fill="#9A3E24" opacity={0.2} />
        <Path d="M29.5 37.5q2.5-1.8 5 0-.4 2.5-2.5 2.5t-2.5-2.5z" fill="#6E4A3A" />
        <Path d="M28.2 42.5q3.8 2.8 7.6 0" fill="none" stroke="#2B1E17" strokeWidth={1.4} strokeLinecap="round" />
        <Path d="M15.5 50q16.5 9.5 33 0l1.2 6q-17.7 8.5-35.4 0z" fill="#C8963E" stroke="#2B1E17" strokeWidth={1.5} strokeLinejoin="round" />
        <Path d="M16 54q16 8 32 0" fill="none" stroke="#9A3E24" strokeWidth={1.5} />
      </Svg>
    </View>
  );
}

/** Tikijhyal criss-cross grille (open) or the finer closed grille (private). Ids are per instance so hidden screens can't break them. */
function Lattice({ fine }: { fine: boolean }) {
  const t = useTheme();
  const id = `${fine ? 'f' : 'l'}${useId().replace(/[^\w-]/g, '')}`;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        {fine ? (
          <Pattern id={id} width={9} height={9} patternUnits="userSpaceOnUse">
            <Path d="M0 0L9 9M9 0L0 9" stroke={t.slat.fine} strokeWidth={1.7} fill="none" />
          </Pattern>
        ) : (
          <Pattern id={id} width={16} height={16} patternUnits="userSpaceOnUse">
            <Path d="M0 0L16 16M16 0L0 16" stroke={t.slat.slat} strokeWidth={3.2} fill="none" />
            <Path d="M0 0L16 16M16 0L0 16" stroke={t.slat.groove} strokeWidth={0.7} fill="none" />
            <Rect x={6.3} y={6.3} width={3.4} height={3.4} transform="rotate(45 8 8)" fill={t.slat.peg} stroke={t.slat.slat} strokeWidth={0.8} />
          </Pattern>
        )}
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

// The brand mark stays cream whatever the scheme, like the app icon.
const MARK = { pane: '#FBF6EC', leaf: '#E9D9B5', stile: '#C8963E' };

const SIZES = {
  mark: { w: 44, h: 44, border: 3, sill: 5, jamb: 11, stile: 3, yeti: 34, yetiLeft: 1 },
  md: { w: 112, h: 68, border: 4, sill: 6, jamb: 22, stile: 4, yeti: 52, yetiLeft: 10 },
  lg: { w: 0, h: 0, border: 5, sill: 8, jamb: 56, stile: 5, yeti: 76, yetiLeft: 0 },
};

type Props = {
  state: WindowState;
  /** mark: 44px brand icon. md: Yeti at a window. lg: fluid task window; children sit in the open part. */
  size?: 'mark' | 'md' | 'lg';
  /** lg only. Shown beside the leaf when open or waiting, on a plate over the closed lattice otherwise. The Yeti peeks over the sill to its right while open. */
  children?: ReactNode;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * One geometry for art and state: a carved frame with a sliding lattice leaf.
 * open = leaf pushed aside (moss), wait = half latticed (brass), paused = closed (stone), private = closed fine grille.
 * The leaf slides 500ms ease-out; with reduced motion it jumps.
 */
export function LatticeWindow({ state, size = 'md', children, label, style }: Props) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const cfg = SIZES[size];
  const lg = size === 'lg';
  const pal = size === 'mark' && state === 'open' ? MARK : t.win[state];
  const closed = state === 'paused' || state === 'private';

  const [stageW, setStageW] = useState(lg ? 0 : cfg.w - 2 * cfg.border);
  const narrow = lg && stageW > 0 && stageW < 440;
  const jamb = narrow ? 36 : cfg.jamb;
  const yeti = lg && narrow ? 56 : cfg.yeti;
  const target = state === 'open' ? stageW - jamb : state === 'wait' ? stageW * (narrow ? 0.7 : 0.6) : 0;

  const [x] = useState(() => new Animated.Value(target));
  const [paneO] = useState(() => new Animated.Value(closed ? 0 : 1));
  const [plateO] = useState(() => new Animated.Value(closed ? 1 : 0));
  const [yetiO] = useState(() => new Animated.Value(state === 'open' ? 1 : 0));
  const seen = useRef<{ state: WindowState; ready: boolean }>({ state, ready: false });

  useEffect(() => {
    if (!stageW) return;
    const animate = seen.current.ready && seen.current.state !== state && !reduced;
    seen.current = { state, ready: true };
    const go = (v: Animated.Value, to: number, duration: number, delay = 0, easing = Easing.out(Easing.cubic)) =>
      animate ? Animated.timing(v, { toValue: to, duration, delay, easing, useNativeDriver: !isWeb }).start() : v.setValue(to);
    go(x, target, 500);
    go(paneO, closed ? 0 : 1, 350);
    go(plateO, closed ? 1 : 0, closed ? 300 : 120, closed ? 300 : 0);
    // lg: the Yeti sits at the open edge, so the leaf covers him as it slides shut; this fade only mops up a sliver on tiny stages.
    go(yetiO, state === 'open' ? 1 : 0, 250, state === 'open' ? 250 : 150);
  }, [state, stageW, target, closed, reduced, x, paneO, plateO, yetiO]);

  // lg: while open the text leaves room for the Yeti between itself and the leaf.
  // Wide stages keep a column beside him; under 440px the title needs the full width, so he gets room below the text instead.
  const roomBeside = lg && state === 'open' && stageW >= 440;
  const roomBelow = lg && state === 'open' && stageW < 440;
  const stagePad = { paddingRight: stageW - target + 20 + (roomBeside ? yeti + 12 : 0), paddingBottom: roomBelow ? Math.round(yeti * 0.7) : undefined };

  return (
    <View
      {...(lg ? { role: 'group' as const, 'aria-label': label } : { 'aria-hidden': true })}
      style={[
        {
          borderWidth: cfg.border,
          borderBottomWidth: cfg.sill,
          borderColor: t.frame,
          borderRadius: RADIUS.frame,
          backgroundColor: pal.pane,
          overflow: 'hidden',
        },
        lg ? { width: '100%' } : { width: cfg.w, height: cfg.h },
        style,
      ]}>
      <View
        onLayout={(e) => setStageW(Math.round(e.nativeEvent.layout.width))}
        style={lg ? { minHeight: 176, justifyContent: 'center' } : { flex: 1 }}>
        {/* the pane behind the leaf */}
        {lg ? (
          <>
            {closed ? null : <Animated.View style={[stagePad, { paddingVertical: 22, paddingLeft: 24, opacity: paneO, zIndex: 0 }]}>{children}</Animated.View>}
            <Animated.View style={{ position: 'absolute', right: jamb + 12, bottom: -Math.round(yeti * 0.12), opacity: yetiO, zIndex: 0 }}>
              <YetiMark size={yeti} />
            </Animated.View>
          </>
        ) : (
          <Animated.View style={{ position: 'absolute', left: cfg.yetiLeft, bottom: -Math.round(cfg.yeti * 0.12), opacity: paneO }}>
            <YetiMark size={cfg.yeti} />
          </Animated.View>
        )}

        {/* the lattice leaf */}
        <Animated.View
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: stageW,
            backgroundColor: pal.leaf,
            borderLeftWidth: cfg.stile,
            borderLeftColor: pal.stile,
            transform: [{ translateX: x }],
            zIndex: 1,
          }}>
          <Lattice fine={state === 'private'} />
        </Animated.View>

        {/* closed: words go on a plate so they never sit on the carving */}
        {lg && closed ? (
          <Animated.View
            style={{
              zIndex: 2,
              alignSelf: 'center',
              maxWidth: '92%',
              margin: 18,
              paddingVertical: 16,
              paddingHorizontal: 20,
              backgroundColor: t.surface,
              borderRadius: RADIUS.frame,
              borderWidth: 1,
              borderColor: t.line,
              opacity: plateO,
            }}>
            {children}
          </Animated.View>
        ) : null}

        {/* brass hairline inside the frame */}
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', zIndex: 3, borderWidth: 1, borderColor: 'rgba(200,150,62,0.55)' }]} />
      </View>
    </View>
  );
}
