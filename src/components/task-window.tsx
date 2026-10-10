import { Linking, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { LatticeWindow } from '@/components/brand';
import { Button } from '@/components/button';
import { useNow } from '@/hooks/use-now';
import { fmtDuration } from '@/lib/story';
import type { ContextSnap, ContextState, Mode } from '@/lib/types';
import { RADIUS, useLayout, useTheme, type WindowState } from '@/theme';

export const RELEASES_URL = 'https://github.com/krimy-7/focusguard/releases';

const STATE_LABEL: Record<ContextState, string> = {
  detected: 'Just noticed',
  active: 'In focus',
  grace: 'On a short detour',
  intervened_l1: 'Checked in',
  escalated_l2: 'Checked in twice',
  on_break: 'On a break',
  ended: 'Wrapped up',
};
const MODE_LABEL: Record<Mode, string> = { work: 'Work', learning: 'Learning', personal: 'Personal' };

/** The lattice carries the state: open = in focus, wait = grace/detour, paused = break or nothing running. */
const WINDOW: Record<ContextState, WindowState> = {
  detected: 'open',
  active: 'open',
  grace: 'wait',
  intervened_l1: 'wait',
  escalated_l2: 'wait',
  on_break: 'paused',
  ended: 'paused',
};

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const minutesSince = (iso: string, now: number) => Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));

function Dot({ color }: { color: string }) {
  return <View aria-hidden style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />;
}

/** The current task in its window. No task, or a break, closes the lattice and puts the words on a plate. */
export function TaskWindow({ ctx }: { ctx: ContextSnap | null }) {
  const t = useTheme();
  const { wide } = useLayout();
  const now = useNow();
  const state: WindowState = ctx ? WINDOW[ctx.state] : 'paused';
  const open = state === 'open' || state === 'wait';

  if (!ctx) {
    return (
      <LatticeWindow state="paused" size="lg" label="Current task: none">
        <AppText variant="heading" level={2}>
          No task in progress
        </AppText>
        <AppText tone="ink2">When you start something in the browser, it shows up here.</AppText>
      </LatticeWindow>
    );
  }

  const dot = state === 'open' ? t.moss : state === 'wait' ? t.brass : null;
  return (
    <LatticeWindow state={state} size="lg" label={`Current task: ${ctx.title}, ${STATE_LABEL[ctx.state].toLowerCase()}`}>
      <View style={{ gap: 6 }}>
        <AppText variant={open && wide ? 'title' : 'heading'} level={2}>
          {ctx.title}
        </AppText>
        <View className="flex-row items-center gap-2">
          {dot ? <Dot color={dot} /> : null}
          <AppText variant="label">{STATE_LABEL[ctx.state]}</AppText>
        </View>
        {open ? (
          <AppText tone="ink2">
            {MODE_LABEL[ctx.mode] ?? MODE_LABEL.work} · {fmtDuration(minutesSince(ctx.started_at, now) * 60)} so far, since {timeOf(ctx.started_at)}
          </AppText>
        ) : (
          <AppText tone="ink2">Take your time. FocusGuard AI is waiting quietly.</AppText>
        )}
        {ctx.sites.length ? (
          <View role="list" aria-label="Sites in this task" className="flex-row flex-wrap gap-2" style={{ marginTop: 6 }}>
            {ctx.sites.slice(0, 5).map((site) => (
              <View key={site} role="listitem" style={{ borderWidth: 1, borderColor: t.line, borderRadius: RADIUS.chip, backgroundColor: t.surface, paddingVertical: 5, paddingHorizontal: 10 }}>
                <AppText variant="small">{site}</AppText>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </LatticeWindow>
  );
}

/** Quiet extension status (only once the extension has synced something). */
export function ExtensionStatus({ ctx }: { ctx: ContextSnap | null }) {
  const t = useTheme();
  const now = useNow();
  const fresh = ctx !== null && now - Date.parse(ctx.last_active_at) < 15 * 60_000;
  const text = fresh
    ? `Extension connected. Last seen ${timeOf(ctx.last_active_at)}.`
    : ctx
      ? `Extension last seen ${timeOf(ctx.last_active_at)}.`
      : 'Extension last synced in the past week.';
  return (
    <View className="flex-row items-center gap-2">
      <Dot color={fresh ? t.moss : t.ink2} />
      <AppText variant="small" tone="ink2">
        {text}
      </AppText>
    </View>
  );
}

/** First run: the Yeti, what FocusGuard does, and the one thing to do next. */
export function Welcome() {
  const t = useTheme();
  const { wide } = useLayout();
  return (
    <View
      className={wide ? 'flex-row items-center gap-6' : 'gap-4'}
      style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: RADIUS.control, padding: wide ? 28 : 20 }}>
      <LatticeWindow state="open" size="md" />
      <View style={{ flex: 1, gap: 10 }}>
        <AppText variant="heading" level={2}>
          Welcome to FocusGuard AI
        </AppText>
        <AppText>FocusGuard AI notices when you drift from your task, waits a while, then helps you get back to it.</AppText>
        <Button label="Install the extension" icon="external" role="link" onPress={() => Linking.openURL(RELEASES_URL)} style={{ marginTop: 4 }} />
        <View className="flex-row items-center gap-2">
          <Dot color={t.ink2} />
          <AppText variant="small" tone="ink2">
            Extension not connected yet. Sign in there with this same email and your task shows up here.
          </AppText>
        </View>
      </View>
    </View>
  );
}
