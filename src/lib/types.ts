// Contract C1 — docs/superpowers/plans/2026-10-10-v1-core-index.md. Keep in lockstep with stream B.

export type QuietRange = { from: string; to: string }; // "HH:MM"
export type Settings = { grace_s?: number /* 120..900 */; quiet_hours?: QuietRange[] /* ≤3 */ };
export type Profile = { user_id: string; tz: string; settings: Settings };

export type Mode = 'work' | 'learning' | 'personal';

export type Goal = {
  id: string;
  day: string;
  title: string;
  category: Mode;
  status: 'open' | 'done';
  sort: number;
  created_at: string;
  done_at: string | null;
};

export type ContextState =
  | 'detected'
  | 'active'
  | 'grace'
  | 'intervened_l1'
  | 'escalated_l2'
  | 'on_break'
  | 'ended';

export type ContextSnap = {
  id: string;
  device_id: string;
  title: string;
  mode: Mode;
  state: ContextState;
  confidence: 'inferred' | 'confirmed';
  started_at: string;
  ended_at: string | null;
  last_active_at: string;
  sites: string[]; // hostnames, ≤50
};

export type DailyTotals = {
  day: string;
  device_id?: string;
  focus_s: number;
  nudges: number;
  self_returns: number;
  recoveries: number;
  snoozes: number;
  breaks: number;
  longest_detour_s: number;
};

export type ExportBundle = { profile: Profile; goals: Goal[]; contexts: ContextSnap[]; daily: DailyTotals[] };

export type MePatch = { tz?: string; settings?: Settings };
export type GoalPatch = { title?: string; status?: Goal['status']; sort?: number; category?: Mode };
