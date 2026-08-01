import type {
  Achievement,
  BeastMode,
  BreakState,
  ContextActivity,
  ContextDetect,
  FocusContext,
  Goal,
  Insight,
  Intervention,
  MoodEntry,
  Session,
  Stats,
  Task,
} from '@/lib/api';

// Offline mock data. Mirrors the backend seed so the UI stays fully
// navigable when the backend is unreachable.

export const MOCK = {
  goals: (): Goal[] => {
    const day = new Date().toISOString().slice(0, 10);
    return [
      { id: 1, title: 'Finish the landing page hero', status: 'in_progress', source: 'ai', day, created_at: `${day}T06:00:00Z` },
      { id: 2, title: 'Study React for one hour', status: 'open', source: 'ai', day, created_at: `${day}T06:00:05Z` },
      { id: 3, title: 'Prepare the presentation', status: 'open', source: 'ai', day, created_at: `${day}T06:00:10Z` },
    ];
  },

  contexts: (): FocusContext[] => [
    {
      id: 1,
      title: 'Landing Page Design',
      mode: 'work',
      source: 'detected',
      active: true,
      confirmed: true,
      note: '',
      created_at: '2026-07-31T06:30:00Z',
      activities: [
        { id: 1, kind: 'domain', label: 'figma.com', domain: 'figma.com', duration_s: 1920, occurred_at: '2026-07-31T08:00:00Z' },
        { id: 2, kind: 'domain', label: 'fonts.google.com', domain: 'fonts.google.com', duration_s: 360, occurred_at: '2026-07-31T08:30:00Z' },
        { id: 3, kind: 'domain', label: 'photoshop.adobe.com', domain: 'photoshop.adobe.com', duration_s: 660, occurred_at: '2026-07-31T09:00:00Z' },
      ],
    },
    {
      id: 2,
      title: 'React Tutorial',
      mode: 'learning',
      source: 'detected',
      active: false,
      confirmed: true,
      note: '',
      created_at: '2026-07-30T13:00:00Z',
      activities: [
        { id: 4, kind: 'domain', label: 'react.dev', domain: 'react.dev', duration_s: 2400, occurred_at: '2026-07-30T13:00:00Z' },
      ],
    },
  ],

  detect: (): ContextDetect => ({
    proposed_title: 'Landing Page Design',
    mode: 'work',
    confidence: 0.82,
    reason: 'Matches your recent activity.',
  }),

  activity: (): ContextActivity => ({
    id: 99,
    kind: 'domain',
    label: 'figma.com',
    domain: 'figma.com',
    duration_s: 120,
    occurred_at: '2026-07-31T09:30:00Z',
  }),

  stats: (): Stats => ({
    focus_time_s: 6840,
    sessions: 3,
    interrupts: 2,
    deep_focus_min: 114,
    score: 82,
    streak_days: 14,
    current_focus: 'Landing Page Design',
  }),

  insight: (): Insight => ({
    provider: 'mock',
    message: "You're absolutely in the zone. Your focus today is impressive!",
    suggestion: 'Try: protecting your momentum for 25 more minutes, then celebrate with a real break.',
    generated_at: new Date().toISOString(),
  }),

  sessions: (): Session[] => {
    const now = new Date();
    const block = (hoursAgo: number, mins: number) => {
      const start = new Date(now.getTime() - hoursAgo * 3600_000);
      const end = new Date(start.getTime() + mins * 60_000);
      return { started_at: start.toISOString(), ended_at: end.toISOString(), duration_s: mins * 60 };
    };
    return [
      { id: 1, task_title: 'Landing Page Design', app_name: 'Chrome', url: 'figma.com', ...block(3, 32), score: 85 },
      { id: 2, task_title: 'React Tutorial', app_name: 'Chrome', url: 'react.dev', ...block(26, 40), score: 78 },
      { id: 3, task_title: 'PR Review', app_name: 'Chrome', url: 'github.com', ...block(50, 40), score: 90 },
      { id: 4, task_title: 'Email batch', app_name: 'Chrome', url: 'gmail.com', ...block(74, 20), score: 60 },
    ];
  },

  break: (): BreakState => ({
    on_break: false,
    context: null,
    saved_progress: '',
    next_step: '',
    since: null,
  }),

  intervention: (): Intervention => ({
    id: 1,
    level: 1,
    message: 'Still on Landing Page Design? Your attention drifted — want to come back?',
    action: '',
    context_id: 1,
    occurred_at: new Date().toISOString(),
  }),

  mood: (): MoodEntry => ({ id: 1, mood: '🙂', note: '', recorded_at: new Date().toISOString() }),

  beast: (): BeastMode | null => ({
    id: 1,
    started_at: new Date().toISOString(),
    ends_at: null,
    duration_min: 60,
    active: false,
    blocked_sites: [],
    blocked_apps: [],
  }),

  achievements: (): Achievement[] => [
    { code: 'first_focus', title: 'First Focus', description: 'Complete your first focus session.', unlocked_at: '2026-07-20T00:00:00Z' },
    { code: 'seven_day_streak', title: '7 Day Streak', description: 'Focused 7 days in a row.', unlocked_at: '2026-07-28T00:00:00Z' },
    { code: 'deep_work', title: 'Deep Work', description: 'Logged a 50+ minute deep focus session.', unlocked_at: '2026-07-25T00:00:00Z' },
    { code: 'context_master', title: 'Context Master', description: 'Confirmed 5 different contexts.', unlocked_at: null },
    { code: 'comeback', title: 'Comeback', description: 'Recovered from a distraction the same day.', unlocked_at: '2026-07-27T00:00:00Z' },
    { code: 'beast_mode', title: 'Beast Mode', description: 'Completed a Beast Mode session.', unlocked_at: null },
  ],

  tasks: (): Task[] => [
    { id: 1, title: 'Validate Tokens', category: 'should', tag: 'Work', status: 'open', created_at: '2026-07-31T00:00:00Z', completed_at: null },
  ],
};
