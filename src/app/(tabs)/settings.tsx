import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { Icon } from '@/components/icon';
import { Notice } from '@/components/notice';
import { Page } from '@/components/page';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { api, noteAccountDeleted, pendingDelete } from '@/lib/api';
import { deviceTz, localDay, quietHoursError } from '@/lib/day';
import { ApiError, errorText, staleMessage } from '@/lib/http';
import { DEMO, supabase, useSession } from '@/lib/supabase';
import type { MePatch, Profile, QuietRange, Settings } from '@/lib/types';
import { RADIUS, useTheme } from '@/theme';
import { webStyle } from '@/theme/web';

const GRACE_CHOICES = [120, 300, 600];

type SectionKey = 'account' | 'grace' | 'quiet' | 'tz' | 'data' | 'delete';
type Status = { key: SectionKey; text: string; error: boolean } | null;

/** A settings block: hairline, h2, content. Not a card. The danger zone is the only boxed one. */
function Section({ title, children, danger }: { title: string; children: ReactNode; danger?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={
        danger
          ? { gap: 12, borderWidth: 1.5, borderColor: t.danger, borderRadius: RADIUS.control, padding: 20 }
          : { gap: 12, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 28 }
      }>
      <AppText variant="heading" level={2} tone={danger ? 'danger' : 'ink'}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

function TextLink({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable role="link" onPress={onPress} disabled={disabled} style={[{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, webStyle({ cursor: 'pointer' })]}>
      <AppText variant="label" style={{ textDecorationLine: 'underline' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const { email } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [ranges, setRanges] = useState<QuietRange[]>([]);
  const [tzDraft, setTzDraft] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  useDocumentTitle('Settings');

  const load = useCallback(async () => {
    try {
      const p = await api.me();
      setProfile(p);
      setRanges(p.settings.quiet_hours ?? []);
      setTzDraft(p.tz);
      setFailure(null);
    } catch (e) {
      setFailure(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const note = (key: SectionKey) => {
    if (status?.key !== key) return null;
    if (key === 'delete' && status.error) {
      return (
        <AppText tone="danger" aria-live="polite">
          {status.text}
        </AppText>
      );
    }
    if (status.error) return <Notice tone="try" urgent>{status.text}</Notice>;
    return (
      <View className="flex-row items-center gap-2" aria-live="polite">
        <Icon name="check" size={18} color={t.moss} />
        <AppText variant="small" tone="ink2">
          {status.text}
        </AppText>
      </View>
    );
  };

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
  const saveSettings = (key: SectionKey, patch: Settings, okText: string) => (profile ? save(key, { settings: patch }, okText) : undefined);

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
    let failed: unknown = null;
    for (const wait of [0, 1000, 3000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        await api.deleteMe();
        await pendingDelete.clear();
        noteAccountDeleted(); // Sign in reads this and says "Your account was deleted. Take care."
        await supabase.auth.signOut({ scope: 'local' }); // the auth gate then shows Sign in
        return;
      } catch (e) {
        failed = e;
        const s = e instanceof ApiError ? e.status : -1;
        if (s !== 502 && s !== 0) break; // anything else will not get better by retrying
      }
    }
    const s = failed instanceof ApiError ? failed.status : -1;
    // After a 502 every other route 401s for this user (server tombstone), so leaving Settings would sign them
    // out. The flag makes http.ts send DELETE /me before any forced sign-out, so the deletion still finishes.
    if (s === 502 || s === 0) await pendingDelete.set();
    // `confirm` is left as typed, so the button stays enabled for a manual retry.
    const text =
      s === 502
        ? "Your data is deleted, but removing your sign-in didn't finish. Press Delete my account again, or FocusGuard AI will finish it the next time you're signed in here."
        : s === 0
          ? `${errorText(failed)} Deletion may have finished. Press Delete my account again to make sure.`
          : `${errorText(failed)} Your account was not deleted.`;
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

  if (!profile && failure) {
    return (
      <Page>
        <EmptyState title="Can’t load your settings" subtitle={errorText(failure)} action={<Button label="Try again" onPress={load} />} />
      </Page>
    );
  }

  return (
    <Page>
      {failure ? <Notice action={<Button tone="quiet" label="Try again" onPress={load} />}>{staleMessage(failure)}</Notice> : null}

      <AppText variant="title" level={1}>
        Settings
      </AppText>

      {!profile ? (
        <View className="items-center py-10">
          <ActivityIndicator color={t.ink} accessibilityLabel="Loading settings" />
        </View>
      ) : (
        <>
          <Section title="Account">
            <AppText>{DEMO ? 'Demo mode: nothing leaves this browser.' : `Signed in as ${email ?? 'unknown'}`}</AppText>
            {!DEMO ? <Button tone="quiet" label="Sign out" disabled={busy} onPress={signOut} /> : null}
            {note('account')}
          </Section>

          <Section title="Grace before a check-in">
            <AppText tone="ink2">How long FocusGuard AI waits after you drift before checking in.</AppText>
            <View role="radiogroup" aria-label="Grace before a check-in" className="flex-row flex-wrap gap-2">
              {GRACE_CHOICES.map((s) => {
                const on = grace === s;
                return (
                  <Pressable
                    key={s}
                    role="radio"
                    accessibilityLabel={`${s / 60} minutes`}
                    aria-checked={on}
                    disabled={busy}
                    onPress={() => saveSettings('grace', { grace_s: s }, `Grace set to ${s / 60} minutes.`)}
                    style={[
                      {
                        minHeight: 44,
                        minWidth: 84,
                        paddingHorizontal: 16,
                        borderRadius: RADIUS.control,
                        borderWidth: 1.5,
                        borderColor: t.ink,
                        backgroundColor: on ? t.ink : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                      webStyle({ cursor: 'pointer' }),
                    ]}>
                    <AppText variant="label" tone={on ? 'onInk' : 'ink'}>
                      {s / 60} min
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {!GRACE_CHOICES.includes(grace) ? (
              <AppText variant="small" tone="ink2">
                Currently {Math.round(grace / 60)} min.
              </AppText>
            ) : null}
            {note('grace')}
          </Section>

          <Section title="Quiet hours">
            <AppText tone="ink2">No check-ins during these times. 24-hour time; overnight is fine (22:00 to 07:00).</AppText>
            {ranges.map((r, i) => (
              <View key={i} className="flex-row items-center gap-3">
                <Field
                  value={r.from}
                  onChangeText={(v) => setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, from: v } : x)))}
                  placeholder="22:00"
                  maxLength={5}
                  accessibilityLabel={`Quiet period ${i + 1} start, 24-hour time`}
                  style={{ width: 96 }}
                />
                <AppText>to</AppText>
                <Field
                  value={r.to}
                  onChangeText={(v) => setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, to: v } : x)))}
                  placeholder="07:00"
                  maxLength={5}
                  accessibilityLabel={`Quiet period ${i + 1} end, 24-hour time`}
                  style={{ width: 96 }}
                />
                <Pressable
                  role="button"
                  accessibilityLabel={`Remove quiet period ${i + 1}`}
                  onPress={() => setRanges((rs) => rs.filter((_, j) => j !== i))}
                  style={[{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, webStyle({ cursor: 'pointer' })]}>
                  <Icon name="close" size={18} color={t.ink2} />
                </Pressable>
              </View>
            ))}
            <View className="flex-row flex-wrap gap-3">
              <Button tone="quiet" label="Add a quiet period" disabled={ranges.length >= 3} onPress={() => setRanges((rs) => [...rs, { from: '22:00', to: '07:00' }])} />
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
            <AppText tone="ink2">Your days (goals and totals) start at midnight in this timezone.</AppText>
            <Field
              value={tzDraft}
              onChangeText={setTzDraft}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Asia/Kathmandu"
              accessibilityLabel="Timezone, for example Asia/Kathmandu"
              style={{ maxWidth: 360 }}
            />
            <View className="flex-row flex-wrap gap-3">
              {tzDraft.trim() !== device ? <Button tone="quiet" label={`Use this device’s (${device})`} onPress={() => setTzDraft(device)} /> : null}
              <Button label="Save timezone" disabled={busy || !tzDraft.trim() || tzDraft.trim() === profile.tz} onPress={() => save('tz', { tz: tzDraft.trim() }, 'Timezone saved.')} />
            </View>
            {note('tz')}
          </Section>

          <Section title="Your data">
            <AppText tone="ink2">
              The server keeps your goals, task names and modes, site names (like github.com), settings and daily totals. Page titles, full addresses and AI keys stay in your browser.
            </AppText>
            <Button tone="quiet" label="Export my data" accessibilityLabel="Export my data as a JSON file" disabled={busy || Platform.OS !== 'web'} onPress={exportData} />
            {Platform.OS !== 'web' ? (
              <AppText variant="small" tone="ink2">
                Export works from the web dashboard.
              </AppText>
            ) : null}
            {note('data')}
          </Section>

          <Section title="Delete my account" danger>
            <AppText>
              This permanently deletes your goals, tasks, daily totals, settings and sign-in. It can’t be undone. The Chrome extension keeps its own local data until you sign out there or remove it.
            </AppText>
            {Platform.OS === 'web' ? <TextLink label="Export my data first" onPress={exportData} disabled={busy} /> : null}
            <AppText variant="small" tone="ink2">
              Type DELETE to confirm.
            </AppText>
            <Field
              value={confirm}
              onChangeText={setConfirm}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Type DELETE to confirm account deletion"
              style={{ maxWidth: 240, borderColor: t.danger }}
            />
            <Button tone="danger" label="Delete my account" disabled={busy || confirm !== 'DELETE'} onPress={deleteAccount} />
            {note('delete')}
          </Section>
        </>
      )}
    </Page>
  );
}
