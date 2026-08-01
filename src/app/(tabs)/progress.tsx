import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { TopAppBar } from '@/components/top-app-bar';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { api, type Achievement, type Goal, type Session, type Stats } from '@/lib/api';
import { Palette } from '@/theme';
import { cn } from '@/theme/tailwind';

const DAY_LABELS = 'SMTWTFS';

function focusPattern(sessions: Session[]) {
  const today = new Date();
  const days: { label: string; minutes: number; active: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const minutes = sessions
      .filter((s) => {
        const start = new Date(s.started_at);
        const sk = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
        return sk === key;
      })
      .reduce((sum, s) => sum + s.duration_s, 0) / 60;
    days.push({ label: DAY_LABELS[d.getDay()], minutes: Math.round(minutes), active: i === 0 });
  }

  const hourTotals = new Map<number, number>();
  sessions.forEach((s) => {
    const h = new Date(s.started_at).getHours();
    hourTotals.set(h, (hourTotals.get(h) || 0) + s.duration_s);
  });
  let peakHour = 9;
  let peakMax = 0;
  hourTotals.forEach((v, h) => {
    if (v > peakMax) {
      peakMax = v;
      peakHour = h;
    }
  });

  return { days, peakHour };
}

function EnergyChart({ sessions }: { sessions: Session[] }) {
  const { days, peakHour } = focusPattern(sessions);
  const maxMin = Math.max(...days.map((d) => d.minutes), 1);
  const suffix = peakHour >= 12 ? 'PM' : 'AM';
  const displayHour = peakHour % 12 || 12;
  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);

  return (
    <Card className="p-lg border border-primary/10">
      <View className="flex-row justify-between items-start mb-lg">
        <View>
          <AppText variant="labelLg" color="on-surface-variant">
            Focus patterns
          </AppText>
          <AppText variant="labelSm" color="on-surface-variant" className="opacity-70">
            {totalMinutes > 0 ? `Peak activity at ${displayHour} ${suffix}` : 'No focus sessions logged yet'}
          </AppText>
        </View>
        <Icon name="lightning-bolt" color={Palette.primary} />
      </View>
      <View className="flex-row items-end justify-between h-32 gap-xs px-xs">
        {days.map((item) => (
          <View key={`${item.label}-${item.minutes}`} className="flex-1 items-center gap-sm h-full justify-end">
            <View
              className={cn('w-full rounded-full', item.active ? 'bg-primary' : 'bg-primary-fixed-dim')}
              style={{ height: `${Math.max(4, (item.minutes / maxMin) * 100)}%` }}
            />
            <AppText variant="labelSm" color={item.active ? 'primary' : 'on-surface-variant'} className="opacity-50">
              {item.label}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

function FocusRing({ score }: { score: number }) {
  const theme = useThemeColors();
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);

  return (
    <Card className="items-center p-lg border border-primary/10">
      <AppText variant="labelLg" color="on-surface-variant">
        Focus Score
      </AppText>
      <View className="w-[192px] h-[192px] mt-md items-center justify-center">
        <Svg width={192} height={192} viewBox="0 0 192 192">
          <Circle cx={96} cy={96} r={radius} fill="transparent" stroke={theme.surfaceContainerHighest} strokeWidth={12} />
          <Circle
            cx={96}
            cy={96}
            r={radius}
            fill="transparent"
            stroke={theme.primary}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={[circumference, circumference]}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 96 96)"
          />
        </Svg>
        <View className="absolute items-center justify-center">
          <AppText variant="headlineXl" color="primary" className="text-[48px]">
            {score}
          </AppText>
          <AppText variant="labelSm" color="on-surface-variant" className="uppercase tracking-[2px]">
            {score >= 85 ? 'Steady' : score >= 60 ? 'Building' : 'Warming up'}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

function StatTile({ icon, label, value, bg }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; value: string; bg: string }) {
  return (
    <View className={cn('flex-1 rounded-[20px] p-md gap-sm', bg)}>
      <Icon name={icon} size={24} />
      <View>
        <AppText variant="headlineLg" className="font-body-bold">
          {value}
        </AppText>
        <AppText variant="labelSm" className="uppercase tracking-[1px] opacity-80">
          {label}
        </AppText>
      </View>
    </View>
  );
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { contentStyle } = useDashboardLayout();

  const [stats, setStats] = useState<Stats | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [st, gs, ach, ss] = await Promise.all([api.getStats(), api.getGoals(), api.getAchievements(), api.getSessions()]);
    setStats(st);
    setGoals(gs);
    setAchievements(ach);
    setSessions(ss);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const doneGoals = goals.filter((g) => g.status === 'done').length;
  const earned = achievements.filter((a) => a.unlocked_at);
  const focusHours = stats ? (stats.focus_time_s / 3600).toFixed(1) : '0.0';

  return (
    <View className="flex-1 bg-background">
      <TopAppBar />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ ...contentStyle, paddingBottom: 40 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Palette.primary} />}
        showsVerticalScrollIndicator={false}>
        {loading ? (
          <View className="items-center py-xl">
            <ActivityIndicator color={Palette.primary} />
          </View>
        ) : (
          <>
            <View className="gap-xs">
              <AppText variant="headlineXl">Your progress</AppText>
              <AppText variant="bodyMd" color="on-surface-variant">
                Small wins compound. Here{"\u2019"}s what your focus is building.
              </AppText>
            </View>

            <FocusRing score={stats?.score ?? 0} />

            <View className="flex-row gap-md">
              <StatTile icon="clipboard-check-outline" label="Goals done" value={`${doneGoals}/${goals.length}`} bg="bg-primary-container" />
              <StatTile icon="timer-check" label="Focus" value={`${focusHours}h`} bg="bg-secondary-container" />
            </View>
            <View className="flex-row gap-md">
              <StatTile icon="history" label="Recoveries" value={`${stats?.interrupts ?? 0}`} bg="bg-surface-container" />
              <StatTile icon="fire" label="Streak" value={`${stats?.streak_days ?? 0}d`} bg="bg-tertiary-container" />
            </View>

            <EnergyChart sessions={sessions} />

            <View className="gap-sm">
              <View className="flex-row items-center justify-between">
                <AppText variant="headlineLgMobile">Achievements</AppText>
                <AppText variant="labelSm" color="on-surface-variant">
                  {earned.length}/{achievements.length}
                </AppText>
              </View>
              <View className="flex-row flex-wrap gap-sm">
                {achievements.map((a) => {
                  const unlocked = Boolean(a.unlocked_at);
                  return (
                    <View
                      key={a.code}
                      className={cn(
                        'w-[48%] grow rounded-[18px] p-md gap-xs border',
                        unlocked ? 'bg-primary-fixed border-primary/20' : 'bg-surface-container-lowest border-outline-variant/40 opacity-60',
                      )}>
                      <View className="flex-row items-center justify-between">
                        <Icon name={unlocked ? 'trophy' : 'trophy-outline'} size={22} color={unlocked ? Palette.primary : Palette.outline} />
                        {unlocked ? <AppText variant="labelSm" color="primary">Earned</AppText> : null}
                      </View>
                      <AppText variant="labelLg">{a.title}</AppText>
                      <AppText variant="labelSm" color="on-surface-variant">
                        {a.description}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
