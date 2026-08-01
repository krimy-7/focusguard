import { MOCK } from '@/lib/mock';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export type Mode = 'learning' | 'work' | 'personal';

export type ContextActivity = {
  id: number;
  kind: string;
  label: string;
  domain: string;
  duration_s: number;
  occurred_at: string;
};

export type FocusContext = {
  id: number;
  title: string;
  mode: Mode;
  source: string;
  active: boolean;
  confirmed: boolean;
  note: string;
  created_at: string;
  activities: ContextActivity[];
};

export type ContextDetect = {
  proposed_title: string;
  mode: Mode;
  confidence: number;
  reason: string;
};

export type Goal = {
  id: number;
  title: string;
  status: 'open' | 'in_progress' | 'done';
  source: string;
  day: string;
  created_at: string;
};

export type Stats = {
  focus_time_s: number;
  sessions: number;
  interrupts: number;
  deep_focus_min: number;
  score: number;
  streak_days: number;
  current_focus: string | null;
};

export type Session = {
  id: number;
  task_title: string;
  app_name: string;
  url: string;
  started_at: string;
  ended_at: string | null;
  duration_s: number;
  score: number;
};

export type Insight = {
  provider: string;
  message: string;
  suggestion: string | null;
  generated_at: string;
};

export type BreakState = {
  on_break: boolean;
  context: FocusContext | null;
  saved_progress: string;
  next_step: string;
  since: string | null;
};

export type Intervention = {
  id: number;
  level: 1 | 2;
  message: string;
  action: string;
  context_id: number | null;
  occurred_at: string;
};

export type MoodEntry = {
  id: number;
  mood: string;
  note: string;
  recorded_at: string;
};

export type BeastMode = {
  id: number;
  started_at: string;
  ends_at: string | null;
  duration_min: number;
  active: boolean;
  blocked_sites: string[];
  blocked_apps: string[];
};

// The backend stores naive UTC timestamps (no timezone marker). JS parses a
// bare ISO string as LOCAL time, so append "Z" unless one is already present.
export function parseServerUtc(value: string | null | undefined): number {
  if (!value) return NaN;
  const s = String(value).trim();
  const hasTz = /Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasTz ? s : `${s}Z`).getTime();
}

export type Achievement = {
  code: string;
  title: string;
  description: string;
  unlocked_at: string | null;
};

export type Task = {
  id: number;
  title: string;
  category: string;
  tag: string;
  status: string;
  created_at: string;
  completed_at: string | null;
};

async function apiFetch<T>(path: string, init?: RequestInit, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      'ngrok-skip-browser-warning': 'true',
      ...(init?.headers ?? {}),
    };
    if (!(init?.body instanceof FormData)) {
      (headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fallback<T>(fn: () => Promise<T>, mock: () => T): Promise<T> {
  try {
    return await fn();
  } catch {
    return mock();
  }
}

export const api = {
  // --- Today / planning ---
  extractGoals: (text: string) =>
    fallback<Goal[]>(() => apiFetch('/api/planning/extract', { method: 'POST', body: JSON.stringify({ text }) }, 12000), MOCK.goals),
  extractGoalsFromAudio: (formData: FormData) =>
    fallback<Goal[]>(() => apiFetch<Goal[]>('/api/planning/extract/audio', { method: 'POST', body: formData }, 18000), MOCK.goals),
  getGoals: (day?: string) =>
    fallback(
      () => apiFetch<Goal[]>(`/api/planning/goals${day ? `?day=${encodeURIComponent(day)}` : ''}`),
      MOCK.goals,
    ),
  updateGoal: (id: number, status: string) =>
    fallback(() => apiFetch<Goal>(`/api/planning/goals/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }), () => MOCK.goals()[0]),

  // --- Contexts ---
  getContexts: () => fallback(() => apiFetch<FocusContext[]>('/api/contexts'), MOCK.contexts),
  detectContext: (signals: Record<string, string>, recentDomains: string[]) =>
    fallback(
      () => apiFetch<ContextDetect>('/api/contexts/detect', { method: 'POST', body: JSON.stringify({ signals, recent_domains: recentDomains }) }, 12000),
      MOCK.detect,
    ),
  createContext: (title: string, mode: Mode, source = 'manual') =>
    fallback(
      () => apiFetch<FocusContext>('/api/contexts', { method: 'POST', body: JSON.stringify({ title, mode, source }) }),
      () => MOCK.contexts()[0],
    ),
  confirmContext: (id: number, title: string, mode: Mode) =>
    fallback(
      () => apiFetch<FocusContext>(`/api/contexts/${id}`, { method: 'PATCH', body: JSON.stringify({ title, mode, confirmed: true, active: true }) }),
      () => MOCK.contexts()[0],
    ),
  setActiveContext: (id: number) =>
    fallback(() => apiFetch<FocusContext>(`/api/contexts/${id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) }), () => MOCK.contexts()[0]),
  groupActivity: (id: number, activity: { kind: string; label: string; domain: string }) =>
    fallback(
      () => apiFetch<ContextActivity>(`/api/contexts/${id}/group`, { method: 'POST', body: JSON.stringify(activity) }),
      MOCK.activity,
    ),

  // --- Watchdog / interventions ---
  getStats: () => fallback(() => apiFetch<Stats>('/api/stats'), MOCK.stats),
  getSessions: () => fallback(() => apiFetch<Session[]>('/api/sessions'), MOCK.sessions),
  getInsight: () => fallback(() => apiFetch<Insight>('/api/insights', undefined, 12000), MOCK.insight),
  triggerIntervention: (level: 1 | 2, message: string) =>
    fallback(() => apiFetch<Intervention>('/api/interventions', { method: 'POST', body: JSON.stringify({ level, message }) }), MOCK.intervention),
  getCurrentIntervention: () =>
    fallback(() => apiFetch<Intervention | null>('/api/interventions/current'), MOCK.intervention),
  resolveIntervention: (id: number, action: string) =>
    fallback(() => apiFetch<Intervention>(`/api/interventions/${id}/action`, { method: 'POST', body: JSON.stringify({ action }) }), MOCK.intervention),

  // --- Break ---
  getBreak: () => fallback(() => apiFetch<BreakState>('/api/break'), MOCK.break),
  startBreak: (saved_progress: string, next_step: string) =>
    fallback(() => apiFetch<BreakState>('/api/break/start', { method: 'POST', body: JSON.stringify({ saved_progress, next_step }) }), MOCK.break),
  resumeBreak: () => fallback(() => apiFetch<BreakState>('/api/break/resume', { method: 'POST' }), MOCK.break),

  // --- Support ---
  logMood: (mood: string, note = '') =>
    fallback(() => apiFetch<MoodEntry>('/api/mood', { method: 'POST', body: JSON.stringify({ mood, note }) }), MOCK.mood),
  getBeast: () => fallback(() => apiFetch<BeastMode | null>('/api/beast'), MOCK.beast),
  startBeast: (duration_min: number, blocked_sites: string[], blocked_apps: string[] = []) =>
    fallback(
      () => apiFetch<BeastMode>('/api/beast', { method: 'POST', body: JSON.stringify({ duration_min, blocked_sites, blocked_apps }) }),
      MOCK.beast,
    ),
  stopBeast: () => fallback(() => apiFetch<BeastMode | null>('/api/beast/stop', { method: 'POST' }), MOCK.beast),
  getAchievements: () => fallback(() => apiFetch<Achievement[]>('/api/achievements'), MOCK.achievements),

  // --- Legacy tasks (kept for compatibility) ---
  getTasks: () => fallback(() => apiFetch<Task[]>('/api/tasks'), MOCK.tasks),
};
