import { deviceTz, localDay, recentDays } from '@/lib/day';
import { MAX_LINES, splitLines } from '@/lib/lines';
import type { ContextSnap, DailyTotals, ExportBundle, Goal, GoalPatch, MePatch, Profile } from '@/lib/types';

// Demo mode (EXPO_PUBLIC_DEMO_MODE=1): in-memory C1-shaped data. No sign-in, no network. Resets on reload.

let profile: Profile = {
  user_id: 'demo-user',
  tz: deviceTz(),
  settings: { grace_s: 300, quiet_hours: [{ from: '22:00', to: '07:00' }] },
};

let seq = 0;
function makeGoal(title: string, day: string, status: Goal['status'] = 'open'): Goal {
  seq += 1;
  const now = new Date().toISOString();
  return { id: `demo-${seq}`, day, title, category: 'work', status, sort: seq, created_at: now, done_at: status === 'done' ? now : null };
}

const today = localDay(new Date(), profile.tz);
let goals: Goal[] = [
  makeGoal('Finish the landing page hero', today, 'done'),
  makeGoal('Study React for one hour', today),
  makeGoal('Prepare the presentation', today),
];

// Newest day first: [focus_s, nudges, self_returns, recoveries, snoozes, breaks, longest_detour_s]; null = nothing recorded.
const WEEK: ([number, number, number, number, number, number, number] | null)[] = [
  [5400, 1, 2, 1, 0, 1, 240],
  [3600, 5, 1, 3, 2, 2, 1500],
  null,
  [7200, 0, 3, 0, 0, 2, 0],
  [2700, 2, 1, 1, 1, 0, 420],
  [9000, 1, 4, 1, 0, 3, 300],
  [1200, 3, 0, 2, 1, 1, 960],
];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const demo = {
  me: (): Profile => profile,

  patchMe(body: MePatch): Profile {
    profile = { ...profile, tz: body.tz ?? profile.tz, settings: { ...profile.settings, ...body.settings } };
    return profile;
  },

  goals: (day: string): Goal[] => goals.filter((g) => g.day === day).sort((a, b) => a.sort - b.sort),

  addGoals(lines: string, day: string): Goal[] {
    const created = splitLines(lines).slice(0, MAX_LINES).map((t) => makeGoal(t, day));
    goals = [...goals, ...created];
    return created;
  },

  patchGoal(id: string, patch: GoalPatch): Goal {
    const g = goals.find((x) => x.id === id);
    if (!g) throw new Error('That item is no longer there.');
    const done_at = patch.status === 'done' ? new Date().toISOString() : patch.status === 'open' ? null : g.done_at;
    const next: Goal = { ...g, ...patch, done_at };
    goals = goals.map((x) => (x.id === id ? next : x));
    return next;
  },

  deleteGoal(id: string): void {
    goals = goals.filter((g) => g.id !== id);
  },

  activeContext: (): ContextSnap => ({
    id: 'demo-ctx',
    device_id: 'demo-device',
    title: 'Landing page redesign',
    mode: 'work',
    state: 'active',
    confidence: 'confirmed',
    started_at: minutesAgo(50),
    ended_at: null,
    last_active_at: minutesAgo(1),
    sites: ['figma.com', 'github.com', 'fonts.google.com'],
  }),

  daily(from: string, to: string): DailyTotals[] {
    return recentDays(WEEK.length, new Date(), profile.tz).flatMap((day, i) => {
      const w = WEEK[i];
      if (!w || day < from || day > to) return [];
      const [focus_s, nudges, self_returns, recoveries, snoozes, breaks, longest_detour_s] = w;
      return [{ day, focus_s, nudges, self_returns, recoveries, snoozes, breaks, longest_detour_s }];
    });
  },

  exportAll(): ExportBundle {
    return { profile, goals, contexts: [demo.activeContext()], daily: demo.daily('0000-01-01', '9999-12-31') };
  },
};
