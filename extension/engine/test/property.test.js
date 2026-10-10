// @ts-check
// Seeded random traces through the same harness: every step is checked against the §6 invariants
// (no early L1, no nudge on break/pause/Beast/green/blind, hourly cap, deadline moves only on extend,
// duplicate inputs are no-ops, no sensitive string in any output).
import { test } from 'node:test';
import { runTrace } from './harness.js';

const SEEDS = 300, EVENTS = 60;

/** mulberry32 — deterministic PRNG for the test only (the engine never uses randomness). */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TABS = [
  { url: 'https://www.figma.com/file/x', title: 'Landing v3' },
  { url: 'https://github.com/a/b', title: 'engine' },
  { url: 'https://reddit.com/r/x', title: 'r/x' },
  { url: 'https://youtube.com/watch', title: 'video' },
  { url: 'https://x.com/home', title: 'Home' },
  { url: 'https://blog.example.org/post', title: 'post' },
  { url: 'https://online.chase.com/acct', title: 'Account 5550001 zz-chase-title' },
  { url: 'https://reddit.com/r/private', title: 'zz-incognito-title', incognito: true },
  { url: 'chrome://settings', title: 'zz-chrome-title' },
];
const CMDS = ['confirm', 'cancel', 'back', 'progress', 'related', 'unrelate', 'dismiss', 'resume', 'end', 'extend', 'break', 'pause', 'new_task'];

/** @param {number} seed */
export function randomTrace(seed) {
  const r = prng(seed);
  const pick = (/** @type {any[]} */ xs) => xs[Math.floor(r() * xs.length)];
  const events = [];
  let t = 0;
  for (let i = 0; i < EVENTS; i++) {
    t += r() < 0.3 ? 0.5 + r() * 5 : 5 + r() * 400;
    t = Math.round(t * 2) / 2;
    const x = r();
    if (x < 0.45) { const id = 1 + Math.floor(r() * TABS.length); events.push({ t, tab: id, ...TABS[id - 1] }); }
    else if (x < 0.72) {
      const cmd = pick(CMDS);
      const e = /** @type {any} */ ({ t, cmd });
      if (cmd === 'extend') e.n = pick([120, 300, 600, 7]);
      if (cmd === 'break' && r() < 0.5) e.note = 'note';
      if (cmd === 'pause') e.until = t + pick([60, 1800, 1e9]);
      if (cmd === 'new_task' && r() < 0.5) e.title = 'Task';
      if (cmd === 'unrelate') e.host = pick(['youtube.com', 'www.reddit.com', 'blog.example.org']);
      events.push(e);
    } else if (x < 0.8) events.push({ t, idle: pick(['idle', 'locked', 'active']) });
    else if (x < 0.85) { events.push({ t, sleep_until: t + 200 + Math.round(r() * 5000) }); t += 5300; }
    else if (x < 0.89) events.push({ t, restart: true });
    else if (x < 0.94) events.push(r() < 0.8 ? { t, tab_group: [1 + Math.floor(r() * TABS.length), pick([7, 8, -1])] } : { t, group_removed: pick([7, 8]) });
    else if (x < 0.97) events.push({ t, tier_hint: { host: 'blog.example.org', tier: pick(['green', 'yellow', 'red']), related: r() < 0.3 } });
    else events.push({ t, dup_alarm: { kind: pick(['grace', 'escalate', 'soft_confirm', 'pause_end']), dueAt: Math.max(0, t - Math.round(r() * 120)) } });
  }
  const cfg = /** @type {any} */ ({ t0: new Date(Date.parse('2026-10-10T20:00:00+05:45') + Math.floor(r() * 8) * 3600_000).toISOString() });
  if (r() < 0.3) cfg.GRACE_DEFAULT_S = pick([60, 120, 900]);
  if (r() < 0.3) cfg.quietHours = [{ from: '22:00', to: '07:00' }];
  if (r() < 0.2) cfg.L1_MIN_GAP_S = 0;
  return { name: `random-${seed}`, until: t + 1200, cfg, events };
}

test(`property: ${SEEDS} seeded random traces hold every invariant`, () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    try { runTrace(randomTrace(seed)); }
    catch (err) { throw new Error(`seed ${seed}: ${/** @type {Error} */ (err).message}`); }
  }
});
