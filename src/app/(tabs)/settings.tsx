import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import { api, pendingDelete } from '@/lib/api';
import { deviceTz, localDay, quietHoursError } from '@/lib/day';
import { ApiError, errorText } from '@/lib/http';
import { DEMO, supabase, useSession } from '@/lib/supabase';
import type { MePatch, Profile, QuietRange, Settings } from '@/lib/types';
import { Palette } from '@/theme';
import { cn } from '@/theme/tailwind';

const GRACE_CHOICES = [120, 300, 600];
const INPUT =
  'min-h-[44px] bg-surface-container-lowest border border-outline-variant rounded-[12px] px-sm font-body text-body-md text-on-surface';

type SectionKey = 'account' | 'grace' | 'quiet' | 'tz' | 'data' | 'delete';
type Status = { key: SectionKey; text: string; error: boolean } | null;

function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <View className={cn('rounded-[24px] border bg-surface p-md gap-sm', danger ? 'border-error-container' : 'border-outline-variant/40')}>
      <AppText variant="labelSm" color="on-surface-variant" className="uppercase tracking-[1.5px]" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { contentStyle, isDesktop } = useDashboardLayout();
  const { email } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ranges, setRanges] = useState<QuietRange[]>([]);
  const [tzDraft, setTzDraft] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api.me();
      setProfile(p);
      setRanges(p.settings.quiet_hours ?? []);
      setTzDraft(p.tz);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const note = (key: SectionKey) =>
    status?.key === key ? (
      <AppText variant="labelSm" color={status.error ? 'error' : 'primary'} accessibilityLiveRegion="polite">
        {status.text}
      </AppText>
    ) : null;

  const save = async (key: SectionKey, body: MePatch, okText: string) => {
    setBusy(true);
    setStatus(null);
    try {
      setProfile(await api.patchMe(body));
      setStatus({ key, text: okText, error: false });
    } catch (e) {
      setStatus({ key, text: `${errorText(e)} Nothing was saved.`, error: true });
    } finally {
      setBusy(false);
    }
  };

  // Send only the changed key. PATCH /me merges settings top-level (index R4), so re-sending a stale
  // copy of the other keys would revert a change made in the extension popup meanwhile.
  const saveSettings = (key: SectionKey, patch: Settings, okText: string) =>
    profile ? save(key, { settings: patch }, okText) : undefined;

  const exportData = async () => {
    if (!profile) return;
    setBusy(true);
    setStatus(null);
    try {
      const data = await api.exportMe();
      const href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = href;
      a.download = `focusguard-export-${localDay(new Date(), profile.tz)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setStatus({ key: 'data', text: 'Your export is downloading.', error: false });
    } catch (e) {
      setStatus({ key: 'data', text: errorText(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (DEMO) {
      setStatus({ key: 'delete', text: 'Demo mode keeps nothing on a server, so there is nothing to delete.', error: false });
      return;
    }
    setBusy(true);
    setStatus(null);
    // Index R9: 502 = rows deleted, auth-user removal did not finish; a retry returns 204.
    // Status 0 = timeout/offline: the server may have finished after we gave up. Retrying is safe either way.
    let failure: unknown = null;
    for (const wait of [0, 1000, 3000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        await api.deleteMe();
        await pendingDelete.clear();
        await supabase.auth.signOut({ scope: 'local' }); // the auth gate then shows Sign in
        return;
      } catch (e) {
        failure = e;
        const s = e instanceof ApiError ? e.status : -1;
        if (s !== 502 && s !== 0) break; // anything else will not get better by retrying
      }
    }
    const s = failure instanceof ApiError ? failure.status : -1;
    // After a 502 every other route 401s for this user (server tombstone), so leaving Settings would sign them
    // out. The flag makes http.ts send DELETE /me before any forced sign-out, so the deletion still finishes.
    if (s === 502 || s === 0) await pendingDelete.set();
    // `confirm` is left as typed, so the button stays enabled for a manual retry.
    const text =
      s === 502
        ? "Your data is deleted, but removing your sign-in didn't finish. Press Delete my account again, or FocusGuard AI will finish it the next time you're signed in here."
        : s === 0
          ? `${errorText(failure)} Deletion may have finished. Press Delete my account again to make sure.`
          : `${errorText(failure)} Your account was not deleted.`;
    setStatus({ key: 'delete', text, error: true });
    setBusy(false);
  };

  const signOut = async () => {
    setBusy(true);
    // Local scope: signing out here must not sign the extension out (separate sessions, spec §3.1).
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      setStatus({ key: 'account', text: error.message, error: true });
      setBusy(false);
    }
  };

  const device = deviceTz();
  const grace = profile?.settings.grace_s ?? 300;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ ...contentStyle, paddingTop: isDesktop ? 36 : 12, paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}>
        <AppText variant="headlineLgMobile" accessibilityRole="header">
          Settings
        </AppText>

        {loadError ? (
          <EmptyState title="Can’t load your settings" subtitle={loadError} action={<Button label="Try again" onPress={load} />} />
        ) : !profile ? (
          <View className="items-center py-xl">
            <ActivityIndicator color={Palette.primary} accessibilityLabel="Loading settings" />
          </View>
        ) : (
          <>
            <Section title="Account">
              <AppText variant="bodyMd">{DEMO ? 'Demo mode: nothing leaves this browser.' : `Signed in as ${email ?? 'unknown'}`}</AppText>
              {!DEMO ? <Button tone="quiet" label="Sign out" disabled={busy} onPress={signOut} className="self-start" /> : null}
              {note('account')}
            </Section>

            <Section title="Grace before a check-in">
              <AppText variant="bodyMd" color="on-surface-variant">
                How long FocusGuard AI waits after you drift before checking in.
              </AppText>
              <View accessibilityRole="radiogroup" className="flex-row gap-sm flex-wrap">
                {GRACE_CHOICES.map((s) => {
                  const on = grace === s;
                  return (
                    <Pressable
                      key={s}
                      accessibilityRole="radio"
                      accessibilityLabel={`${s / 60} minutes`}
                      aria-checked={on}
                      disabled={busy}
                      onPress={() => saveSettings('grace', { grace_s: s }, `Grace set to ${s / 60} minutes.`)}
                      className={cn(
                        'min-h-[44px] min-w-[72px] px-md rounded-full border items-center justify-center',
                        on ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-container-low',
                      )}>
                      <AppText variant="labelLg" color={on ? 'primary' : 'on-surface-variant'}>
                        {s / 60} min
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              {!GRACE_CHOICES.includes(grace) ? (
                <AppText variant="labelSm" color="on-surface-variant">
                  Currently {Math.round(grace / 60)} min.
                </AppText>
              ) : null}
              {note('grace')}
            </Section>

            <Section title="Quiet hours">
              <AppText variant="bodyMd" color="on-surface-variant">
                No check-ins during these times. 24-hour time; overnight is fine (22:00 to 07:00).
              </AppText>
              {ranges.map((r, i) => (
                <View key={i} className="flex-row items-center gap-sm">
                  <TextInput
                    value={r.from}
                    onChangeText={(v) => setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, from: v } : x)))}
                    placeholder="22:00"
                    placeholderTextColor={Palette.outline}
                    maxLength={5}
                    accessibilityLabel={`Quiet period ${i + 1} start, 24-hour time`}
                    className={cn(INPUT, 'w-[88px]')}
                  />
                  <AppText variant="bodyMd">to</AppText>
                  <TextInput
                    value={r.to}
                    onChangeText={(v) => setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, to: v } : x)))}
                    placeholder="07:00"
                    placeholderTextColor={Palette.outline}
                    maxLength={5}
                    accessibilityLabel={`Quiet period ${i + 1} end, 24-hour time`}
                    className={cn(INPUT, 'w-[88px]')}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove quiet period ${i + 1}`}
                    onPress={() => setRanges((rs) => rs.filter((_, j) => j !== i))}
                    className="w-11 h-11 items-center justify-center">
                    <Icon name="close" size={18} color={Palette.onSurfaceVariant} />
                  </Pressable>
                </View>
              ))}
              <View className="flex-row gap-sm flex-wrap">
                <Button
                  tone="quiet"
                  label="Add a quiet period"
                  disabled={ranges.length >= 3}
                  onPress={() => setRanges((rs) => [...rs, { from: '22:00', to: '07:00' }])}
                />
                <Button
                  label="Save quiet hours"
                  disabled={busy}
                  onPress={() => {
                    const err = quietHoursError(ranges);
                    if (err) setStatus({ key: 'quiet', text: err, error: true });
                    else saveSettings('quiet', { quiet_hours: ranges }, 'Quiet hours saved.');
                  }}
                />
              </View>
              {note('quiet')}
            </Section>

            <Section title="Timezone">
              <AppText variant="bodyMd" color="on-surface-variant">
                Your days (goals and totals) start at midnight in this timezone.
              </AppText>
              <TextInput
                value={tzDraft}
                onChangeText={setTzDraft}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Asia/Kathmandu"
                placeholderTextColor={Palette.outline}
                accessibilityLabel="Timezone, for example Asia/Kathmandu"
                className={INPUT}
              />
              <View className="flex-row gap-sm flex-wrap">
                {tzDraft.trim() !== device ? (
                  <Button tone="quiet" label={`Use this device’s (${device})`} onPress={() => setTzDraft(device)} />
                ) : null}
                <Button
                  label="Save timezone"
                  disabled={busy || !tzDraft.trim() || tzDraft.trim() === profile.tz}
                  onPress={() => save('tz', { tz: tzDraft.trim() }, 'Timezone saved.')}
                />
              </View>
              {note('tz')}
            </Section>

            <Section title="Your data">
              <AppText variant="bodyMd" color="on-surface-variant">
                The server keeps your goals, context names and modes, site names (like github.com), settings and daily
                totals. Page titles, full addresses and AI keys stay in your browser.
              </AppText>
              <Button
                tone="quiet"
                label="Export my data"
                accessibilityLabel="Export my data as a JSON file"
                disabled={busy || Platform.OS !== 'web'}
                onPress={exportData}
                className="self-start"
              />
              {Platform.OS !== 'web' ? (
                <AppText variant="labelSm" color="on-surface-variant">
                  Export works from the web dashboard.
                </AppText>
              ) : null}
              {note('data')}
            </Section>

            <Section title="Delete my account" danger>
              <AppText variant="bodyMd">
                This permanently deletes your goals, contexts, daily totals, settings and sign-in. It can’t be undone. The
                Chrome extension keeps its own local data until you sign out there or remove it.
              </AppText>
              <AppText variant="labelSm" color="on-surface-variant">
                Type DELETE to confirm.
              </AppText>
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel="Type DELETE to confirm account deletion"
                className={INPUT}
              />
              <Button
                tone="danger"
                label="Delete my account"
                disabled={busy || confirm !== 'DELETE'}
                onPress={deleteAccount}
                className="self-start"
              />
              {note('delete')}
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}
