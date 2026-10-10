import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';

import { ApiError, MESSAGES, makeCaller } from '@/lib/http';
import { demo } from '@/lib/mock';
import { DEMO, supabase } from '@/lib/supabase';
import type { ContextSnap, DailyTotals, ExportBundle, Goal, GoalPatch, MePatch, Profile } from '@/lib/types';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Set when the session ended on its own (refresh did not work), so Sign in can say why the user is there. */
export const sessionNotice = { ended: false };
// A function, not a field write at the call site: the React Compiler lint rule (react-hooks/immutability) rejects
// assigning to an imported object inside a component.
export const clearSessionNotice = () => {
  sessionNotice.ended = false;
};

const PENDING_DELETE = 'fg.pendingDelete';
/** Set when DELETE /me ended in 502 or never answered (Task 10). http.ts finishes the delete on the next forced sign-out. */
export const pendingDelete = {
  get: async () => (await AsyncStorage.getItem(PENDING_DELETE).catch(() => null)) === '1',
  set: () => AsyncStorage.setItem(PENDING_DELETE, '1').catch(() => {}),
  clear: () => AsyncStorage.removeItem(PENDING_DELETE).catch(() => {}),
};

// A refresh that hit the network (offline, auth 5xx) returns an error but supabase-js keeps the stored
// session on purpose. Throwing here shows the offline message instead of signing the user out.
const offline = () => new ApiError(0, MESSAGES.offline);

const call = makeCaller({
  baseUrl: `${API_URL}/api`,
  // getSession() refreshes an expired access token before returning it (auth research §3.4).
  getToken: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error && isAuthRetryableFetchError(error)) throw offline();
    return data.session?.access_token ?? null;
  },
  refresh: async () => {
    const { error } = await supabase.auth.refreshSession();
    if (error && isAuthRetryableFetchError(error)) throw offline();
    return !error;
  },
  // Local scope: never revoke the extension's separate session (spec §3.1).
  onSignedOut: async () => {
    sessionNotice.ended = true; // the screen that caught the error unmounts; Sign in shows the notice instead
    await supabase.auth.signOut({ scope: 'local' });
  },
  pendingDelete,
});

const q = encodeURIComponent;

// Demo mode never touches the network; async wrappers turn demo throws into rejections.
export const api = {
  me: async () => {
    if (DEMO) return demo.me();
    const p = await call<Profile>('GET', '/me');
    // GET /me only succeeds when no deletion tombstone exists, so an old pending-delete flag is stale.
    await pendingDelete.clear();
    return p;
  },
  patchMe: async (body: MePatch) => (DEMO ? demo.patchMe(body) : call<Profile>('PATCH', '/me', body)),
  exportMe: async () => (DEMO ? demo.exportAll() : call<ExportBundle>('GET', '/me/export')),
  deleteMe: async () => (DEMO ? undefined : call<void>('DELETE', '/me')),

  goals: async (day: string) => (DEMO ? demo.goals(day) : call<Goal[]>('GET', `/goals?day=${q(day)}`)),
  addGoals: async (lines: string, day: string) =>
    DEMO ? demo.addGoals(lines, day) : call<Goal[]>('POST', '/goals', { lines, day }),
  patchGoal: async (id: string, patch: GoalPatch) =>
    DEMO ? demo.patchGoal(id, patch) : call<Goal>('PATCH', `/goals/${q(id)}`, patch),
  deleteGoal: async (id: string) => (DEMO ? demo.deleteGoal(id) : call<void>('DELETE', `/goals/${q(id)}`)),

  activeContext: async (): Promise<ContextSnap | null> =>
    DEMO ? demo.activeContext() : ((await call<ContextSnap[]>('GET', '/contexts?active=1'))[0] ?? null),

  daily: async (from: string, to: string) =>
    DEMO ? demo.daily(from, to) : call<DailyTotals[]>('GET', `/daily?from=${q(from)}&to=${q(to)}`),
};
