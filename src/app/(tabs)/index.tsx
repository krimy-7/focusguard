import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { GoalRow } from '@/components/goal-row';
import { Notice } from '@/components/notice';
import { Page } from '@/components/page';
import { Snackbar } from '@/components/snackbar';
import { ExtensionStatus, TaskWindow, Welcome } from '@/components/task-window';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { api } from '@/lib/api';
import { deviceTz, recentDays } from '@/lib/day';
import { errorText, staleMessage } from '@/lib/http';
import { MAX_TITLE, linesError, splitLines } from '@/lib/lines';
import { headlineFor } from '@/lib/story';
import type { ContextSnap, DailyTotals, Goal } from '@/lib/types';
import { TYPE, useLayout, useTheme } from '@/theme';
import { webStyle } from '@/theme/web';

const UNDO_MS = 10_000;
type Pending = { goal: Goal; timer: ReturnType<typeof setTimeout> };

export default function TodayScreen() {
  const t = useTheme();
  const { wide } = useLayout();

  const [tz, setTz] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [ctx, setCtx] = useState<ContextSnap | null>(null);
  const [week, setWeek] = useState<DailyTotals[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [undoing, setUndoing] = useState<Goal | null>(null);
  const pending = useRef<Pending | null>(null);

  useDocumentTitle('Today');

  // A failed refresh keeps whatever was loaded before and says so; it only replaces the page on a first load.
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

  // Delete is undoable: the goal leaves the list at once, but DELETE only goes out after the undo window.
  const sendDelete = (goal: Goal) =>
    write(async () => {
      try {
        await api.deleteGoal(goal.id);
      } catch (e) {
        setGoals((prev) => [...prev, goal].sort((a, b) => a.sort - b.sort));
        throw e;
      }
    });
  const flushPending = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setUndoing(null);
    sendDelete(p.goal);
  };
  const onDelete = (goal: Goal) => {
    flushPending();
    setGoals((prev) => prev.filter((g) => g.id !== goal.id));
    pending.current = { goal, timer: setTimeout(flushPending, UNDO_MS) };
    setUndoing(goal);
  };
  const undoDelete = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setUndoing(null);
    setGoals((prev) => [...prev, p.goal].sort((a, b) => a.sort - b.sort));
  };
  useEffect(() => () => clearTimeout(pending.current?.timer), []);

  const lines = splitLines(draft);
  const draftError = linesError(lines);
  const canAdd = day !== null && lines.length > 0 && draftError === null && !adding;

  const add = async () => {
    if (!day || !canAdd) return;
    setAdding(true);
    await write(async () => {
      const created = await api.addGoals(lines.join('\n'), day);
      setGoals((prev) => [...prev, ...created]);
      setDraft('');
    });
    setAdding(false);
  };

  // Web: Enter adds a single-line goal; Shift+Enter starts another line; Ctrl/Cmd+Enter adds a longer list.
  const onKeyPress = (e: { nativeEvent: { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }; preventDefault?: () => void }) => {
    if (Platform.OS !== 'web') return;
    const { key, shiftKey, ctrlKey, metaKey } = e.nativeEvent;
    if (key !== 'Enter' || shiftKey) return;
    if (ctrlKey || metaKey || !draft.includes('\n')) {
      e.preventDefault?.();
      add();
    }
  };

  const device = deviceTz();
  const done = goals.filter((g) => g.status === 'done').length;
  const todayTotals = week.find((d) => d.day === day) ?? null;
  const everSynced = ctx !== null || week.length > 0;
  const hasData = day !== null;
  const headline = headlineFor(todayTotals);

  if (!hasData && failure) {
    return (
      <Page>
        <EmptyState title="Can’t load today" subtitle={errorText(failure)} action={<Button label="Try again" onPress={load} />} />
      </Page>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Page refreshing={loading} onRefresh={load}>
        {failure ? <Notice action={<Button tone="quiet" label="Try again" onPress={load} />}>{staleMessage(failure)}</Notice> : null}

        {!hasData ? (
          <View className="items-center gap-4 py-10">
            <ActivityIndicator color={t.ink} accessibilityLabel="Loading today" />
            <AppText variant="displaySm" level={1} style={{ textAlign: 'center' }}>
              Getting your day ready
            </AppText>
          </View>
        ) : (
          <>
            <View style={{ gap: 12 }}>
              <AppText variant={wide ? 'display' : 'displaySm'} level={1}>
                {headline.before.replace(/FocusGuard AI/g, 'FocusGuard AI')}
                {headline.mark ? (
                  <Text
                    style={[
                      { textDecorationLine: 'underline', textDecorationColor: t.brass },
                      webStyle({ textDecorationThickness: wide ? '6px' : '4px', textUnderlineOffset: wide ? '5px' : '3px', textDecorationSkipInk: 'none' }),
                    ]}>
                    {headline.mark}
                  </Text>
                ) : null}
                {headline.after}
              </AppText>
              <AppText tone="ink2">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz ?? undefined })}
                {tz && tz !== device ? ` · Your days follow ${tz} time. You can change this in Settings.` : ''}
              </AppText>
            </View>

            {actionError ? <Notice tone="try" urgent>{actionError}</Notice> : null}

            {everSynced ? (
              <View style={{ gap: 12 }}>
                <TaskWindow ctx={ctx} />
                <ExtensionStatus ctx={ctx} />
              </View>
            ) : (
              <Welcome />
            )}

            <View style={{ gap: 4 }}>
              <View className="flex-row items-baseline justify-between gap-4">
                <AppText variant="heading" level={2}>
                  Today’s goals
                </AppText>
                {goals.length ? (
                  <AppText variant="small" tone="ink2">
                    {done} of {goals.length} done
                  </AppText>
                ) : null}
              </View>

              {goals.length === 0 ? (
                <AppText tone="ink2" style={{ paddingVertical: 12 }}>
                  Nothing planned yet. What matters today?
                </AppText>
              ) : (
                <View role="list" aria-label="Today’s goals" style={{ borderTopWidth: 1, borderTopColor: t.line, marginTop: 8 }}>
                  {goals.map((g) => (
                    <GoalRow
                      key={g.id}
                      goal={g}
                      onToggle={() => write(async () => replace(await api.patchGoal(g.id, { status: g.status === 'done' ? 'open' : 'done' })))}
                      onRename={(title) => write(async () => replace(await api.patchGoal(g.id, { title })))}
                      onDelete={() => onDelete(g)}
                    />
                  ))}
                </View>
              )}

              <View style={{ marginTop: 20, gap: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 20 }}>
                <AppText variant="label" nativeID="add-goal-label">
                  Add a goal
                </AppText>
                <AppText variant="small" tone="ink2">
                  Write it your way, Nepali and Hindi work too. Enter adds it. Shift+Enter starts another line.
                </AppText>
                <Field
                  hand
                  multiline
                  value={draft}
                  onChangeText={setDraft}
                  onKeyPress={onKeyPress}
                  placeholder="What would feel good to finish?"
                  maxLength={MAX_TITLE * 20}
                  textAlignVertical="top"
                  accessibilityLabel="New goals, one per line"
                  aria-labelledby="add-goal-label"
                  style={{ minHeight: 48 + (Math.min(Math.max(draft.split('\n').length, 1), 6) - 1) * TYPE.handField.lineHeight }}
                />
                {draftError ? (
                  <AppText variant="small" tone="ink2" aria-live="polite">
                    {draftError}
                  </AppText>
                ) : lines.length > 1 ? (
                  <AppText variant="small" tone="ink2">{`Adds ${lines.length} goals.`}</AppText>
                ) : null}
                <Button label={adding ? 'Adding…' : lines.length > 1 ? `Add ${lines.length} goals` : 'Add goal'} disabled={!canAdd} onPress={add} />
              </View>
            </View>
          </>
        )}
      </Page>
      {undoing ? <Snackbar message="Goal deleted." actionLabel="Undo" onAction={undoDelete} /> : null}
    </View>
  );
}
