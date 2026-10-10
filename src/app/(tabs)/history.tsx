import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import { api } from '@/lib/api';
import { dayLabel, recentDays } from '@/lib/day';
import { errorText } from '@/lib/http';
import { fmtDuration, storyFor } from '@/lib/story';
import type { DailyTotals } from '@/lib/types';
import { Palette } from '@/theme';

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
  return (
    <View className="gap-xs pt-sm border-t border-outline-variant/40">
      {rows.map(([label, value]) => (
        <View key={label} className="flex-row justify-between">
          <AppText variant="labelSm" color="on-surface-variant">
            {label}
          </AppText>
          <AppText variant="labelSm">{value}</AppText>
        </View>
      ))}
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { contentStyle, isDesktop } = useDashboardLayout();
  const [days, setDays] = useState<string[]>([]);
  const [byDay, setByDay] = useState<Record<string, DailyTotals>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api.me();
      const ds = recentDays(7, new Date(), me.tz);
      const rows = await api.daily(ds[6], ds[0]);
      setDays(ds);
      setByDay(Object.fromEntries(rows.map((r) => [r.day, r])));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ ...contentStyle, paddingTop: isDesktop ? 36 : 12, paddingBottom: 40 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Palette.primary} />}
        showsVerticalScrollIndicator={false}>
        <AppText variant="headlineLgMobile" accessibilityRole="header">
          Last 7 days
        </AppText>

        {loading && days.length === 0 ? (
          <View className="items-center py-xl">
            <ActivityIndicator color={Palette.primary} accessibilityLabel="Loading history" />
          </View>
        ) : error ? (
          <EmptyState title="Can’t load your history" subtitle={error} action={<Button label="Try again" onPress={load} />} />
        ) : (
          <View className="gap-sm">
            {days.map((day, i) => {
              const t = byDay[day] ?? null;
              const name = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : dayLabel(day);
              const story = storyFor(t);
              const expanded = open === day;
              return (
                <Card key={day} radius={20} shadow={false} className="px-md py-sm">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${name}. ${story}${t ? (expanded ? ' Hide totals.' : ' Show totals.') : ''}`}
                    aria-expanded={expanded}
                    disabled={!t}
                    onPress={() => setOpen(expanded ? null : day)}
                    className="min-h-[44px] flex-row items-start gap-sm">
                    <View className="flex-1 gap-[2px]">
                      <AppText variant="labelLg">{name}</AppText>
                      <AppText variant="bodyMd" color={t ? 'on-surface' : 'on-surface-variant'}>
                        {story}
                      </AppText>
                    </View>
                    {t ? <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={Palette.onSurfaceVariant} /> : null}
                  </Pressable>
                  {expanded && t ? <Totals t={t} /> : null}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
