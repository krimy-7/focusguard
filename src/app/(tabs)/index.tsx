import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { MascotAvatar } from '@/components/mascot';
import { ModePill } from '@/components/mode-pill';
import { api, type BreakState, type FocusContext, type Goal, type Insight, type Intervention, type Stats } from '@/lib/api';
import { Palette, ScreenContent } from '@/theme';
import { cn } from '@/theme/tailwind';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatDay() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function GoalRow({
  goal,
  onToggle,
  onChange,
  onRemove,
  editable,
}: {
  goal: Goal;
  onToggle: () => void;
  onChange?: (title: string) => void;
  onRemove?: () => void;
  editable?: boolean;
}) {
  const done = goal.status === 'done';
  const [editing, setEditing] = useState(false);

  return (
    <View
      className={cn(
        'flex-row items-center gap-sm p-sm rounded-[14px] border border-outline-variant/40 bg-surface-container-lowest',
        done && 'opacity-55',
      )}>
      <Pressable onPress={onToggle} hitSlop={8} className="w-8 h-8 rounded-full border-2 items-center justify-center active:scale-90"
        style={{ borderColor: done ? Palette.secondary : Palette.outline, backgroundColor: done ? Palette.secondary : 'transparent' }}>
        {done && <Icon name="check" size={16} color={Palette.onSecondary} />}
      </Pressable>

      {editable && onChange ? (
        <TextInput
          value={goal.title}
          onChangeText={onChange}
          onBlur={() => setEditing(false)}
          autoFocus
          className="flex-1 font-body text-body-md text-on-surface"
        />
      ) : (
        <Pressable className="flex-1" onPress={() => editable && setEditing(true)}>
          <AppText variant="bodyMd" className={cn(done && 'line-through')}>
            {goal.title}
          </AppText>
        </Pressable>
      )}

      {onRemove ? (
        <Pressable hitSlop={8} onPress={onRemove} className="p-xs">
          <Icon name="close" size={16} color={Palette.outline} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [contexts, setContexts] = useState<FocusContext[]>([]);
  const [breakState, setBreakState] = useState<BreakState>({ on_break: false, context: null, saved_progress: '', next_step: '', since: null });
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);

  const [planningText, setPlanningText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [planned, setPlanned] = useState(false);

  const activeContext = contexts.find((c) => c.active) ?? null;

  const load = useCallback(async () => {
    const [gs, cs, bs, iv, st, inInsight] = await Promise.all([
      api.getGoals(),
      api.getContexts(),
      api.getBreak(),
      api.getCurrentIntervention(),
      api.getStats(),
      api.getInsight(),
    ]);
    setGoals(gs);
    setContexts(cs);
    setBreakState(bs);
    setIntervention(iv);
    setStats(st);
    setInsight(inInsight);
    setPlanned(gs.some((g) => g.day === todayKey()));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleExtract = async () => {
    if (!planningText.trim()) return;
    setExtracting(true);
    const extracted = await api.extractGoals(planningText);
    setGoals(extracted);
    setPlanned(true);
    setExtracting(false);
    setPlanningText('');
  };

  const toggleGoal = async (goal: Goal) => {
    const next = goal.status === 'done' ? 'open' : 'done';
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, status: next } : g)));
    await api.updateGoal(goal.id, next);
  };

  const handleResume = async () => {
    await api.resumeBreak();
    setBreakState({ on_break: false, context: null, saved_progress: '', next_step: '', since: null });
    load();
  };

  const resolve = async (action: string) => {
    if (intervention) await api.resolveIntervention(intervention.id, action);
    setIntervention(null);
    if (action === 'take_break') {
      const bs = await api.startBreak(activeContext?.title ?? '', 'Continue where you left off');
      setBreakState(bs);
    }
    load();
  };

  const plannedToday = goals.filter((g) => g.day === todayKey());

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ ...ScreenContent, paddingTop: 12, paddingBottom: 40 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Palette.primary} />}
        showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-sm">
            <MascotAvatar size={44} />
            <View>
              <AppText variant="headlineMd">{greeting()}</AppText>
              <AppText variant="labelSm" color="on-surface-variant">
                {formatDay()}
              </AppText>
            </View>
          </View>
          <Pressable hitSlop={8} onPress={() => router.push('/settings')} className="w-10 h-10 items-center justify-center rounded-full active:bg-surface-container-high">
            <Icon name="cog-outline" color={Palette.onSurfaceVariant} />
          </Pressable>
        </View>

        {loading ? (
          <View className="items-center py-xl">
            <ActivityIndicator color={Palette.primary} />
          </View>
        ) : (
          <>
            {/* Morning planning */}
            {!plannedToday.length ? (
              <Card surface="surface-container-low" radius={24} className="p-lg gap-sm border border-primary/10">
                <AppText variant="headlineLgMobile">Plan your day</AppText>
                <AppText variant="bodyMd" color="on-surface-variant">
                  Tell FocusGuard what matters today. Say it like you'd think it:
                </AppText>
                <TextInput
                  value={planningText}
                  onChangeText={setPlanningText}
                  placeholder="Finish the landing page, study React for an hour, prepare the presentation…"
                  placeholderTextColor={Palette.outline}
                  multiline
                  className="min-h-[88px] bg-surface-container-lowest border border-outline-variant rounded-[14px] p-md font-body text-body-md text-on-surface"
                />
                <Pressable
                  onPress={handleExtract}
                  disabled={extracting || !planningText.trim()}
                  className="bg-primary rounded-full px-lg py-sm items-center active:opacity-85 disabled:opacity-50">
                  {extracting ? (
                    <ActivityIndicator color={Palette.onPrimary} />
                  ) : (
                    <AppText variant="labelLg" color="on-primary">
                      Create my plan
                    </AppText>
                  )}
                </Pressable>
                <AppText variant="labelSm" color="on-surface-variant" className="text-center">
                  Your plan can be edited before the day begins.
                </AppText>
              </Card>
            ) : (
              <View className="gap-sm">
                <View className="flex-row items-center justify-between">
                  <AppText variant="headlineLgMobile">Today's goals</AppText>
                  <Pressable hitSlop={8} onPress={() => router.push('/progress')} className="flex-row items-center gap-xs">
                    <AppText variant="labelSm" color="primary">
                      {stats?.score ?? 0} focus
                    </AppText>
                    <Icon name="chevron-right" size={14} color={Palette.primary} />
                  </Pressable>
                </View>
                {plannedToday.map((goal) => (
                  <GoalRow key={goal.id} goal={goal} onToggle={() => toggleGoal(goal)} />
                ))}
              </View>
            )}

            {/* Break banner */}
            {breakState.on_break ? (
              <Card surface="secondary-container" radius={24} className="p-lg gap-sm">
                <AppText variant="headlineMd" color="on-secondary-container">
                  Welcome back 🌱
                </AppText>
                <AppText variant="bodyMd" color="on-secondary-container">
                  You were working on {breakState.context?.title ?? 'something important'}.
                </AppText>
                {breakState.next_step ? (
                  <AppText variant="bodyMd" color="on-secondary-container" className="font-body-bold">
                    Next: {breakState.next_step}
                  </AppText>
                ) : null}
                <Pressable onPress={handleResume} className="bg-on-secondary-container rounded-full px-lg py-sm items-center self-start active:opacity-85">
                  <AppText variant="labelLg" color="secondary-container">
                    Resume
                  </AppText>
                </Pressable>
              </Card>
            ) : null}

            {/* Active context / watchdog */}
            {activeContext ? (
              <Card className="p-lg gap-sm border border-primary/10">
                <View className="flex-row items-center justify-between">
                  <AppText variant="labelSm" color="on-surface-variant" className="uppercase tracking-[1.5px]">
                    Active context
                  </AppText>
                  <View className="flex-row items-center gap-xs">
                    <View className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                    <AppText variant="labelSm" color="on-surface-variant">
                      Watching
                    </AppText>
                  </View>
                </View>
                <View className="flex-row items-center gap-sm">
                  <AppText variant="headlineMd" className="flex-1">
                    {activeContext.title}
                  </AppText>
                  <ModePill mode={activeContext.mode} />
                </View>
                {activeContext.activities.length > 0 ? (
                  <View className="flex-row flex-wrap gap-xs">
                    {activeContext.activities.slice(0, 4).map((a) => (
                      <View key={a.id} className="px-sm py-xs rounded-full bg-surface-container-high">
                        <AppText variant="labelSm" color="on-surface-variant">
                          {a.label}
                        </AppText>
                      </View>
                    ))}
                  </View>
                ) : null}
                <Pressable onPress={() => router.push('/contexts')} className="self-start flex-row items-center gap-xs pt-xs">
                  <AppText variant="labelLg" color="primary">
                    Manage contexts
                  </AppText>
                  <Icon name="arrow-right" size={16} color={Palette.primary} />
                </Pressable>
              </Card>
            ) : null}

            {/* Gentle intervention */}
            {intervention ? (
              <View className="bg-primary rounded-[24px] p-lg gap-sm -rotate-1 shadow-sm">
                <View className="flex-row items-center gap-sm">
                  <MascotAvatar size={40} />
                  <AppText variant="labelLg" color="on-primary">
                    {intervention.level === 2 ? 'Second heads-up' : 'Gentle nudge'}
                  </AppText>
                </View>
                <AppText variant="bodyMd" color="on-primary" className="leading-[22px]">
                  {intervention.message}
                </AppText>
                <View className="flex-row flex-wrap gap-sm pt-xs">
                  <Pressable onPress={() => resolve('back_to_work')} className="px-md py-xs rounded-full bg-on-primary active:opacity-85">
                    <AppText variant="labelSm" color="primary">
                      Back to work
                    </AppText>
                  </Pressable>
                  <Pressable onPress={() => resolve('extend_timer')} className="px-md py-xs rounded-full border border-white/40 active:opacity-85">
                    <AppText variant="labelSm" color="on-primary">
                      Extend timer
                    </AppText>
                  </Pressable>
                  <Pressable onPress={() => resolve('take_break')} className="px-md py-xs rounded-full border border-white/40 active:opacity-85">
                    <AppText variant="labelSm" color="on-primary">
                      Take a break
                    </AppText>
                  </Pressable>
                  <Pressable onPress={() => resolve('dismiss')} className="px-md py-xs rounded-full border border-white/40 active:opacity-85">
                    <AppText variant="labelSm" color="on-primary">
                      Dismiss
                    </AppText>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Quick capture + insight */}
            <View className="gap-sm">
              <Pressable
                onPress={() => router.push('/support')}
                className="flex-row items-center gap-md p-md rounded-[20px] bg-surface-container-high active:opacity-85">
                <View className="w-10 h-10 rounded-full bg-secondary-container items-center justify-center">
                  <Icon name="plus" color={Palette.onSecondaryContainer} />
                </View>
                <View className="flex-1">
                  <AppText variant="labelLg">Quick capture</AppText>
                  <AppText variant="labelSm" color="on-surface-variant">
                    Log a goal, mood or start a focus timer
                  </AppText>
                </View>
                <Icon name="chevron-right" color={Palette.outline} />
              </Pressable>

              {!intervention && activeContext ? (
                <Card surface="tertiary-container" radius={20} className="p-md gap-xs">
                  <AppText variant="labelSm" color="on-tertiary-container" className="italic">
                    "{insight?.message ?? apiInsightFallback}"
                  </AppText>
                  {insight?.suggestion ? (
                    <AppText variant="labelSm" color="on-tertiary-container" className="font-body-bold">
                      {insight.suggestion}
                    </AppText>
                  ) : null}
                </Card>
              ) : null}
            </View>

            {!goals.length && !contexts.length ? (
              <EmptyState title="A fresh start" subtitle="Plan your morning and FocusGuard will quietly watch your context all day." />
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const apiInsightFallback =
  'Plan your day, and I will quietly watch for drift and nudge you back to what matters.';
