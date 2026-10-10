import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { ModePill } from '@/components/mode-pill';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import { api } from '@/lib/api';
import { deviceTz, recentDays } from '@/lib/day';
import { errorText } from '@/lib/http';
import { MAX_TITLE, linesError, splitLines } from '@/lib/lines';
import { storyFor } from '@/lib/story';
import type { ContextSnap, ContextState, DailyTotals, Goal } from '@/lib/types';
import { Palette } from '@/theme';
import { cn } from '@/theme/tailwind';

const STATE_LABEL: Record<ContextState, string> = {
  detected: 'Just noticed',
  active: 'In focus',
  grace: 'On a short detour',
  intervened_l1: 'Checked in',
  escalated_l2: 'Checked in twice',
  on_break: 'On a break',
  ended: 'Wrapped up',
};

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function GoalRow({
  goal,
  onToggle,
  onRename,
  onDelete,
}: {
  goal: Goal;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal.title);
  const done = goal.status === 'done';

  // Only onBlur commits (single-line submit blurs), so one edit = one PATCH.
  const commit = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== goal.title && t.length <= MAX_TITLE) onRename(t);
    else setDraft(goal.title);
  };

  return (
    <View
      className={cn(
        'flex-row items-center gap-xs pr-xs rounded-[14px] border border-outline-variant/40 bg-surface-container-lowest min-h-[52px]',
        done && 'opacity-60',
      )}>
      <Pressable
        accessibilityRole="checkbox"
        aria-checked={done}
        accessibilityLabel={`${goal.title}: mark ${done ? 'not done' : 'done'}`}
        onPress={onToggle}
        className="w-11 h-11 items-center justify-center">
        <View
          className="w-7 h-7 rounded-full border-2 items-center justify-center"
          style={{ borderColor: done ? Palette.primary : Palette.outline, backgroundColor: done ? Palette.primary : 'transparent' }}>
          {done ? <Icon name="check" size={16} color={Palette.onPrimary} /> : null}
        </View>
      </Pressable>

      {editing ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          autoFocus
          maxLength={MAX_TITLE}
          returnKeyType="done"
          accessibilityLabel="Goal title"
          className="flex-1 min-h-[44px] font-body text-body-md text-on-surface"
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit goal: ${goal.title}`}
          onPress={() => {
            setDraft(goal.title);
            setEditing(true);
          }}
          className="flex-1 min-h-[44px] justify-center">
          <AppText variant="bodyMd" className={cn(done && 'line-through')}>
            {goal.title}
          </AppText>
        </Pressable>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete goal: ${goal.title}`}
        onPress={onDelete}
        className="w-11 h-11 items-center justify-center">
        <Icon name="close" size={18} color={Palette.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

function ContextCard({ ctx, everSynced }: { ctx: ContextSnap | null; everSynced: boolean }) {
  const heading = (
    <AppText variant="labelSm" color="on-surface-variant" className="uppercase tracking-[1.5px]">
      Current context
    </AppText>
  );
  if (!ctx && !everSynced) {
    return (
      <Card surface="surface-container-low" radius={24} className="p-lg gap-sm">
        {heading}
        {/* everSynced only looks back 7 days, so this copy must also read right for a returning user. */}
        <AppText variant="headlineMd">Nothing in progress</AppText>
        <AppText variant="bodyMd" color="on-surface-variant">
          Not seeing anything yet? Install the FocusGuard AI Chrome extension and sign in there with this same email.
          What you’re working on will show up here.
        </AppText>
      </Card>
    );
  }
  if (!ctx) {
    return (
      <Card surface="surface-container-low" radius={24} className="p-lg gap-sm">
        {heading}
        <AppText variant="bodyMd" color="on-surface-variant">
          Nothing in progress right now.
        </AppText>
      </Card>
    );
  }
  return (
    <Card radius={24} className="p-lg gap-sm">
      <View className="flex-row items-center justify-between">
        {heading}
        <AppText variant="labelSm" color="on-surface-variant">
          {STATE_LABEL[ctx.state]}
        </AppText>
      </View>
      <View className="flex-row items-center gap-sm">
        <AppText variant="headlineMd" className="flex-1">
          {ctx.title}
        </AppText>
        <ModePill mode={ctx.mode} />
      </View>
      {ctx.sites.length ? (
        <View className="flex-row flex-wrap gap-xs">
          {ctx.sites.slice(0, 5).map((site) => (
            <View key={site} className="px-sm py-xs rounded-full bg-surface-container-high">
              <AppText variant="labelSm" color="on-surface-variant">
                {site}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      <AppText variant="labelSm" color="on-surface-variant">
        Since {timeOf(ctx.started_at)} · last seen {timeOf(ctx.last_active_at)}
      </AppText>
    </Card>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { contentStyle, isDesktop } = useDashboardLayout();

  const [tz, setTz] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [ctx, setCtx] = useState<ContextSnap | null>(null);
  const [week, setWeek] = useState<DailyTotals[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api.me();
      const days = recentDays(7, new Date(), me.tz); // [0] = today in the profile tz
      const [gs, active, daily] = await Promise.all([api.goals(days[0]), api.activeContext(), api.daily(days[6], days[0])]);
      setTz(me.tz);
      setDay(days[0]);
      setGoals(gs);
      setCtx(active);
      setWeek(daily);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Writes update local state only after the server confirms.
  const write = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(`${errorText(e)} Nothing was saved.`);
    }
  };
  const replace = (updated: Goal) => setGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));

  const lines = splitLines(draft);
  const draftError = linesError(lines);
  const canAdd = day !== null && lines.length > 0 && draftError === null && !adding;

  const add = async () => {
    if (!day) return;
    setAdding(true);
    await write(async () => {
      const created = await api.addGoals(lines.join('\n'), day);
      setGoals((prev) => [...prev, ...created]);
      setDraft('');
    });
    setAdding(false);
  };

  const device = deviceTz();
  const done = goals.filter((g) => g.status === 'done').length;
  const todayTotals = week.find((d) => d.day === day) ?? null;
  const everSynced = ctx !== null || week.length > 0;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ ...contentStyle, paddingTop: isDesktop ? 36 : 12, paddingBottom: 40 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Palette.primary} />}
        showsVerticalScrollIndicator={false}>
        <View className="gap-xs">
          <AppText variant="headlineLgMobile" accessibilityRole="header">
            Today
          </AppText>
          <AppText variant="labelSm" color="on-surface-variant">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz ?? undefined })}
          </AppText>
          {tz && tz !== device ? (
            <AppText variant="labelSm" color="on-surface-variant">
              Your days follow {tz} time. You can change this in Settings.
            </AppText>
          ) : null}
        </View>

        {loading && day === null ? (
          <View className="items-center py-xl">
            <ActivityIndicator color={Palette.primary} accessibilityLabel="Loading today" />
          </View>
        ) : loadError ? (
          <EmptyState title="Can’t load today" subtitle={loadError} action={<Button label="Try again" onPress={load} />} />
        ) : (
          <>
            {actionError ? (
              <AppText variant="labelSm" color="error" accessibilityLiveRegion="polite">
                {actionError}
              </AppText>
            ) : null}

            <Card radius={24} className="p-lg gap-md">
              <View className="flex-row items-center justify-between">
                <AppText variant="headlineMd">Goals</AppText>
                {goals.length ? (
                  <AppText variant="labelSm" color="on-surface-variant">
                    {done} of {goals.length} done
                  </AppText>
                ) : null}
              </View>

              {goals.length === 0 ? (
                <AppText variant="bodyMd" color="on-surface-variant">
                  Nothing planned yet. What matters today?
                </AppText>
              ) : (
                <View className="gap-sm">
                  {goals.map((g) => (
                    <GoalRow
                      key={g.id}
                      goal={g}
                      onToggle={() => write(async () => replace(await api.patchGoal(g.id, { status: g.status === 'done' ? 'open' : 'done' })))}
                      onRename={(title) => write(async () => replace(await api.patchGoal(g.id, { title })))}
                      onDelete={() =>
                        write(async () => {
                          await api.deleteGoal(g.id);
                          setGoals((prev) => prev.filter((x) => x.id !== g.id));
                        })
                      }
                    />
                  ))}
                </View>
              )}

              <TextInput
                multiline
                value={draft}
                onChangeText={setDraft}
                placeholder={'One goal per line\nFinish the report\nReply to Sita'}
                placeholderTextColor={Palette.outline}
                textAlignVertical="top"
                accessibilityLabel="New goals, one per line"
                className="min-h-[96px] bg-surface-container-lowest border border-outline-variant rounded-[14px] px-md py-sm font-body text-body-md text-on-surface"
              />
              {draftError ? (
                <AppText variant="labelSm" color="error" accessibilityLiveRegion="polite">
                  {draftError}
                </AppText>
              ) : lines.length ? (
                <AppText variant="labelSm" color="on-surface-variant">
                  {lines.length === 1 ? 'Adds 1 goal.' : `Adds ${lines.length} goals.`}
                </AppText>
              ) : null}
              <Button label={adding ? 'Adding…' : 'Add goals'} disabled={!canAdd} onPress={add} className="self-start" />
            </Card>

            <ContextCard ctx={ctx} everSynced={everSynced} />

            <Card surface="surface-container-low" radius={24} className="p-lg gap-sm">
              <AppText variant="labelSm" color="on-surface-variant" className="uppercase tracking-[1.5px]">
                Today so far
              </AppText>
              <AppText variant="bodyLg">{storyFor(todayTotals)}</AppText>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
