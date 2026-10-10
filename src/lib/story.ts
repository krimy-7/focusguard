// Today/History story lines (SPEC §13.2 voice). Pure: only a type import.
import type { DailyTotals } from './types';

export const BANNED_WORDS = ['lazy', 'failed', 'wasted', 'distracted again', 'you should have', 'disappointing'] as const;

export function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  if (m < 1) return 'under a minute';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${m} min`;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/**
 * One calm paragraph about a day. No score, no blame; hard days are stated neutrally.
 * Uses focus, check-ins (nudges), self-returns, breaks and longest detour only —
 * `recoveries`/`snoozes` are shown as raw totals in History (their overlap with self_returns is not pinned by C1).
 */
export function storyFor(t: DailyTotals | null | undefined): string {
  if (!t || t.focus_s + t.nudges + t.self_returns + t.recoveries + t.breaks === 0) return 'Nothing recorded for this day.';
  const hard = t.nudges >= 3 || t.longest_detour_s >= 900;
  const smooth = !hard && t.nudges <= 1 && t.focus_s >= 1800;
  const out: string[] = [];
  if (smooth) out.push('A smooth day.');
  if (hard) out.push("A bumpy day, and that's okay.");
  out.push(t.focus_s >= 60 ? `You spent ${fmtDuration(t.focus_s)} in focus.` : 'Not much focus time was recorded.');
  out.push(t.nudges === 0 ? "FocusGuard AI didn't need to check in." : `FocusGuard AI checked in ${times(t.nudges)}.`);
  if (t.self_returns > 0) out.push(`You came back on your own ${times(t.self_returns)}.`);
  if (hard && t.longest_detour_s >= 60) out.push(`Your longest detour was ${fmtDuration(t.longest_detour_s)}.`);
  if (t.breaks > 0) out.push(`You took ${t.breaks === 1 ? 'a break' : `${t.breaks} breaks`}.`);
  return out.join(' ');
}
