import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Notice } from '@/components/notice';
import { Page } from '@/components/page';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { api } from '@/lib/api';
import { dayLabel, dayShort, recentDays } from '@/lib/day';
import { errorText, staleMessage } from '@/lib/http';
import { fmtDuration, storyFor } from '@/lib/story';
import type { DailyTotals } from '@/lib/types';
import { RADIUS, useLayout, useTheme } from '@/theme';
import { webStyle } from '@/theme/web';

// One fixed scale for every plate, so days compare by shape. Full height = 6 hours of focus; each dot = one check-in.
const FULL_S = 6 * 3600;
const BAND = 34;
const MAX_DOTS = 9;

function Plate({ t: totals, label, day, selected, height, onPress }: { t: DailyTotals | null; label: string; day: string; selected: boolean; height: number; onPress: () => void }) {
  const c = useTheme();
  const fill = totals ? Math.min(totals.focus_s / FULL_S, 1) : 0;
  const dots = totals ? Math.min(totals.nudges, MAX_DOTS) : 0;
  return (
    <Pressable
      role="button"
      aria-pressed={selected}
      accessibilityLabel={`${label}. ${storyFor(totals)}`}
      onPress={onPress}
      style={[{ flex: 1, minWidth: 0, alignItems: 'stretch', gap: 6 }, webStyle({ cursor: 'pointer' })]}>
      <View
        style={{
          height,
          borderRadius: RADIUS.frame,
          borderWidth: selected ? 3 : 2,
          borderColor: c.ink,
          backgroundColor: c.surface,
          overflow: 'hidden',
        }}>
        <View style={{ height: BAND, backgroundColor: c.stone, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 3 }}>
          {Array.from({ length: dots }, (_, i) => (
            <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.brass, borderWidth: 1, borderColor: c.ink }} />
          ))}
        </View>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ height: `${Math.round(fill * 100)}%`, backgroundColor: c.moss }} />
        </View>
      </View>
      <View style={{ alignItems: 'center' }}>
        <AppText variant={selected ? 'label' : 'small'} tone={selected ? 'ink' : 'ink2'} style={{ textAlign: 'center' }}>
          {`${dayShort(day)} ${Number(day.slice(8))}`}
        </AppText>
        <View style={{ height: 4, width: '70%', marginTop: 2, backgroundColor: selected ? c.brass : 'transparent', borderRadius: 2 }} />
      </View>
    </Pressable>
  );
}

function Totals({ t }: { t: DailyTotals }) {
  const rows: [string, string][] = [
    ['Focus time', fmtDuration(t.focus_s)],
    ['Check-ins', String(t.nudges)],
    ['Came back on your own', String(t.self_returns)],
    ['Times you got back on track', String(t.recoveries)],
    ['Extra time taken', String(t.snoozes)],
    ['Breaks', String(t.breaks)],
    ['Longest detour', t.longest_detour_s ? fmtDuration(t.longest_detour_s) : 'none'],
  ];
  const c = useTheme();
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.line, marginTop: 4 }}>
      {rows.map(([label, value]) => (
        <View key={label} className="flex-row items-baseline justify-between gap-4" style={{ minHeight: 40, borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: 8 }}>
          <AppText tone="ink2">{label}</AppText>
          <AppText variant="label">{value}</AppText>
        </View>
      ))}
    </View>
  );
}

export default function HistoryScreen() {
  const c = useTheme();
  const { wide } = useLayout();
  const [days, setDays] = useState<string[]>([]);
  const [byDay, setByDay] = useState<Record<string, DailyTotals>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<unknown>(null);

  useDocumentTitle('History');

  // A failed refresh keeps the last loaded week on screen and says so.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api.me();
      const ds = recentDays(7, new Date(), me.tz);
      const rows = await api.daily(ds[6], ds[0]);
      setDays(ds);
      setByDay(Object.fromEntries(rows.map((r) => [r.day, r])));
      setSelected((cur) => (cur && ds.includes(cur) ? cur : ds[0]));
      setFailure(null);
    } catch (e) {
      setFailure(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const nameOf = (day: string) => {
    const i = days.indexOf(day);
    return i === 0 ? 'Today' : i === 1 ? 'Yesterday' : dayLabel(day);
  };

  if (days.length === 0 && failure) {
    return (
      <Page>
        <EmptyState title="Can’t load your history" subtitle={errorText(failure)} action={<Button label="Try again" onPress={load} />} />
      </Page>
    );
  }

  const shown = selected ? (byDay[selected] ?? null) : null;
  const oldestFirst = [...days].reverse();

  return (
    <Page refreshing={loading} onRefresh={load}>
      {failure ? <Notice action={<Button tone="quiet" label="Try again" onPress={load} />}>{staleMessage(failure)}</Notice> : null}

      <View style={{ gap: 12 }}>
        <AppText variant="title" level={1}>
          Last 7 days
        </AppText>
        <AppText tone="ink2">Each plate is one day, all at the same scale. Moss height is focus time, up to 6 hours. Each brass dot is a check-in.</AppText>
      </View>

      {days.length === 0 ? (
        <View className="items-center py-10">
          <ActivityIndicator color={c.ink} accessibilityLabel="Loading history" />
        </View>
      ) : (
        <>
          <View role="group" aria-label="Last 7 days, oldest to newest" className="flex-row" style={{ gap: wide ? 12 : 6 }}>
            {oldestFirst.map((day) => (
              <Plate key={day} t={byDay[day] ?? null} label={nameOf(day)} day={day} selected={selected === day} height={wide ? 156 : 124} onPress={() => setSelected(day)} />
            ))}
          </View>

          {selected ? (
            <View style={{ gap: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: RADIUS.control, padding: wide ? 28 : 20 }}>
              <AppText variant="heading" level={2}>
                {nameOf(selected)}
              </AppText>
              <AppText>{storyFor(shown)}</AppText>
              {shown ? <Totals t={shown} /> : null}
            </View>
          ) : null}
        </>
      )}
    </Page>
  );
}
