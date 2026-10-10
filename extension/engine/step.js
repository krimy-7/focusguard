// @ts-check
// FocusGuard drift engine. Pure: no chrome.*, no Date.now(), no fetch, no Math.random().
// Normative: docs/research/2026-10-10-engine-design-notes.md §2 + spec §4.4.
import { keyOf, matchHost, normalizeHost, tierOf } from './tiers.js';

/** @typedef {import('./tiers.js').Seed} Seed */
/** @typedef {import('./tiers.js').Tier} Tier */
/** @typedef {import('./tiers.js').Mode} Mode */
/** @typedef {import('./tiers.js').TierHint} TierHint */
/** @typedef {'idle'|'detected'|'active'|'grace'|'intervened_l1'|'escalated_l2'|'on_break'} Phase */
/** @typedef {{tabId:number, host:string|null, title:string, tier:Tier, inCtx:boolean, at:number}} Landing */
/** @typedef {{id:string, title:string, mode:Mode, confidence:'inferred'|'confirmed', startedAt:number,
 *   groupId:number|null, groupTabIds:number[], lastTabId:number|null, pendingGroupTabId:number|null, adoptNextGroup:boolean, adoptUntil:number,
 *   relatedHosts:string[], resources:{host:string, lastSeen:number}[]}} Ctx */
/** @typedef {{id:string, startedAt:number, anchor:number, deadline:number, graceS:number, tier:'yellow'|'red',
 *   l1At:number|null, l2Due:number|null, extended:boolean, interventionId:string|null}} Drift */
/** @typedef {{tabId:number, host:string, title:string, suggested:{title:string, mode:Mode}, softAt:number}} Proposal */
/** @typedef {{
 *   v:1, rev:number, phase:Phase, ctx:Ctx|null, proposal:Proposal|null, suppressed:string[],
 *   pending:{tabId:number, host:string|null, title:string, ts:number}|null,
 *   current:Landing|null, drift:Drift|null, momentumS:number, momentumSince:number|null,
 *   nudgeTimes:number[], lastL1At:number|null, day:{key:string, ignored:number},
 *   pausedUntil:number|null, brk:{startedAt:number, note:string|null}|null, idle:boolean, lastSeenAt:number,
 *   hints:Record<string, TierHint>, cmdIds:string[] }} EngineState */
/** @typedef {typeof DEFAULTS & {tz:string, quietHours:{from:string, to:string}[], beastUntil:number|null,
 *   tables:{seed:Seed, cache?:Record<string, any>}}} Cfg */ // R21: D also passes `cache` (fg_tier_cache); the engine ignores it
/** Engine notes §2.3 + spec §4.4 (new_task, tier_hint) + R14 (unrelate).
 * @typedef {
 * | {type:'landing', tabId:number, host:string|null, title:string, ts:number}
 * | {type:'tab_group', tabId:number|null, groupId:number, removed?:boolean}
 * | {type:'cmd', id?:string, cmd:'confirm', title?:string, mode?:string}
 * | {type:'cmd', id?:string, cmd:'cancel'|'back'|'progress'|'related'|'dismiss'|'resume'|'end'}
 * | {type:'cmd', id?:string, cmd:'extend', n:number}
 * | {type:'cmd', id?:string, cmd:'break', note?:string}
 * | {type:'cmd', id?:string, cmd:'pause', until:number}
 * | {type:'cmd', id?:string, cmd:'new_task', title?:string}
 * | {type:'cmd', id?:string, cmd:'unrelate', host:string}
 * | {type:'alarm', kind:'grace'|'escalate'|'soft_confirm'|'pause_end', dueAt:number}
 * | {type:'idle', state:'active'|'idle'|'locked'}
 * | {type:'heartbeat', reason:'tick'|'dwell'|'startup'}
 * | {type:'tier_hint', host:string, tier:'green'|'yellow'|'red', related:boolean}
 * } EngineInput */
/** @typedef {'context'|'resource'|'drift'|'intervention'|'response'|'recovery'|'break'|'rule'|'session_end'|'focus'} SyncKind */
/** @typedef {{id:string, at:number, day:string, contextId:string|null, kind:SyncKind, [k:string]:any}} SyncRec */
/** Engine notes §2.3.
 * @typedef {
 * | {type:'schedule_alarm', kind:string, at:number} | {type:'cancel_alarm', kind:string}
 * | {type:'show_nudge', level:1|2, interventionId:string, copyKey:string, vars:{context:string, awayMin:number}, actions:string[], extendOptionsS:number[]}
 * | {type:'hide_nudge'} | {type:'show_progress', contextId:string}
 * | {type:'show_recovery', copyKey:'welcome_back', vars:{context:string, note:string|null, awayMin:number}}
 * | {type:'propose_context', host:string, title:string, suggested:{title:string, mode:string}}
 * | {type:'group_tab', contextId:string, tabId:number, title:string}
 * | {type:'focus_tab', contextId:string, tabId:number|null} | {type:'reopen_group', contextId:string}
 * | {type:'persist_resume', contextId:string} | {type:'drop_resume', contextId:string}
 * | {type:'sync', rec:SyncRec}
 * | {type:'log', level:'debug'|'info', msg:string, data?:object}
 * } Effect */
/** @typedef {(s:EngineState, i:any, now:number, cfg:Cfg, fx:Effect[]) => void} Handler */

// A plain const, then frozen: `Object.freeze({...literal})` infers literal types (GRACE_DEFAULT_S: 300), and the
// R21 cfg `{...DEFAULTS, GRACE_DEFAULT_S: settings.grace_s ?? 300}` would then fail D's type-check.
const defaults = {
  GRACE_DEFAULT_S: 300, GRACE_MIN_S: 60, GRACE_MAX_S: 900,
  DWELL_MIN_S: 4, ROLLING_WINDOW_S: 60, VELOCITY_PAGES_HIGH: 5, // velocity: v1.1, unused
  ESCALATION_DELAY_S: 300, INACTIVITY_THRESHOLD_S: 600,
  INTERVENTION_MAX_PER_HOUR: 3, L1_MIN_GAP_S: 600, EXTEND_OPTIONS_S: Object.freeze([120, 300, 600]),
  SOFT_CONFIRM_TIMEOUT_S: 90, RAW_RETENTION_DAYS: 7, COLD_START_DAYS: 3, // server-side only
  MOMENTUM_MID_MIN: 20, MOMENTUM_HIGH_MIN: 45,
  MOMENTUM_FACTOR: Object.freeze({ low: 1.0, mid: 0.7, high: 0.4 }), HIGH_MOMENTUM_FLOOR_S: 120,
  RISK_FACTOR: Object.freeze({ yellow: 1.2, red: 1.0 }),
  STALE_ALARM_S: 90, SLEEP_GAP_S: 180, HEARTBEAT_S: 60,
  IGNORES_BEFORE_REDUCE: 3, REDUCED_MAX_PER_HOUR: 1,
};
export const DEFAULTS = Object.freeze(defaults);

const S = 1000;
const HOUR = 3600 * S;
const ADOPT_WINDOW_S = 60; // after reopen_group, D's group reports arrive within ms; a group made later is the user's own
const NUDGE_ACTIONS = Object.freeze(['back', 'related', 'new_task', 'extend', 'break']);

/**
 * Grace in seconds for a drift to `tier` after `momentumS` seconds of in-context work (D-3).
 * @param {'yellow'|'red'} tier
 * @param {number} momentumS
 * @param {Pick<Cfg,'GRACE_DEFAULT_S'|'GRACE_MIN_S'|'GRACE_MAX_S'|'MOMENTUM_MID_MIN'|'MOMENTUM_HIGH_MIN'|'MOMENTUM_FACTOR'|'HIGH_MOMENTUM_FLOOR_S'|'RISK_FACTOR'>} cfg
 */
export function graceFor(tier, momentumS, cfg) {
  const base = cfg.GRACE_DEFAULT_S, min = momentumS / 60;
  const m = min > cfg.MOMENTUM_HIGH_MIN ? 'high' : min >= cfg.MOMENTUM_MID_MIN ? 'mid' : 'low';
  let g = base * cfg.MOMENTUM_FACTOR[m] * cfg.RISK_FACTOR[tier];
  if (m === 'high') g = Math.max(g, Math.min(cfg.HIGH_MOMENTUM_FLOOR_S, base)); // floor never exceeds base
  return Math.round(Math.min(cfg.GRACE_MAX_S, Math.max(cfg.GRACE_MIN_S, g)));
}

/** @param {number} now @returns {EngineState} */
export function initialState(now) {
  return {
    v: 1, rev: 0, phase: 'idle', ctx: null, proposal: null, suppressed: [], pending: null,
    current: null, drift: null, momentumS: 0, momentumSince: null, nudgeTimes: [], lastL1At: null,
    day: { key: '', ignored: 0 }, pausedUntil: null, brk: null, idle: false, lastSeenAt: now,
    hints: {}, cmdIds: [],
  };
}

/**
 * @param {EngineState} prev @param {EngineInput} input @param {number} now @param {Cfg} cfg
 * @returns {{state: EngineState, effects: Effect[]}}
 */
export function step(prev, input, now, cfg) {
  const i = /** @type {any} */ (input);
  const handler = i && typeof i.type === 'string' && Object.hasOwn(HANDLERS, i.type) ? HANDLERS[i.type] : null;
  if (!handler) return { state: prev, effects: [log('info', 'unknown_input', { type: i && i.type })] };
  if (i.type === 'cmd' && typeof i.id === 'string' && prev.cmdIds.includes(i.id)) {
    return { state: prev, effects: [log('debug', 'duplicate_cmd', { id: i.id })] };
  }
  const s = structuredClone(prev);
  /** @type {Effect[]} */ const fx = [];
  s.rev++;
  if (i.type === 'cmd' && typeof i.id === 'string') s.cmdIds = [...s.cmdIds, i.id].slice(-20);
  // Browser start (D sends `startup` only from runtime.onStartup): Chrome reassigns tab and group ids, so forget every
  // id we hold before the preamble's commit and sleep-gap reland run (engine notes §4). The next group_tab report re-adopts a group.
  if (i.type === 'heartbeat' && i.reason === 'startup') {
    s.pending = null;
    s.idle = false; // D sends idle/locked/active only on change, so a flag from before the restart would stick
    if (s.phase === 'detected') { s.proposal = null; s.phase = 'idle'; } // a confirm must not group a pre-restart tab id; the next landing re-proposes
    if (s.current) s.current.tabId = -1; // TAB_ID_NONE; host and tier stay (a drift in grace still nudges, trace 20)
    if (s.ctx) Object.assign(s.ctx, { groupId: null, groupTabIds: [], lastTabId: null, pendingGroupTabId: null, adoptNextGroup: false, adoptUntil: 0 });
  }
  preamble(s, now, cfg, fx);
  handler(s, i, now, cfg, fx);
  s.lastSeenAt = now;
  s.nudgeTimes = s.nudgeTimes.filter((t) => now - t < HOUR);
  const before = i.type === 'heartbeat' && i.reason === 'startup' ? {} : alarmsFor(prev);
  fx.push(...diffAlarms(before, alarmsFor(s)));
  return { state: s, effects: fx };
}

/** @param {EngineState} s @returns {Record<string, number>} */
export function alarmsFor(s) {
  /** @type {Record<string, number>} */ const a = {};
  if (s.phase === 'detected' && s.proposal) a.soft_confirm = s.proposal.softAt;
  if (s.phase === 'grace' && s.drift) a.grace = s.drift.deadline;
  if (s.phase === 'intervened_l1' && s.drift && s.drift.l2Due !== null) a.escalate = s.drift.l2Due;
  if (s.pausedUntil !== null && s.pausedUntil !== Number.MAX_SAFE_INTEGER) a.pause_end = s.pausedUntil;
  return a;
}

/** @param {Record<string, number>} a @param {Record<string, number>} b @returns {Effect[]} */
function diffAlarms(a, b) {
  /** @type {Effect[]} */ const out = [];
  for (const kind of Object.keys(a)) if (!(kind in b)) out.push({ type: 'cancel_alarm', kind });
  for (const [kind, at] of Object.entries(b)) if (a[kind] !== at) out.push({ type: 'schedule_alarm', kind, at });
  return out;
}

// ── helpers ─────────────────────────────────────────────────────────────────────

/** @param {'debug'|'info'} level @param {string} msg @param {object} [data] @returns {Effect} */
function log(level, msg, data) {
  return data ? { type: 'log', level, msg, data } : { type: 'log', level, msg };
}

/** @param {EngineState} s @param {number} now @param {Effect[]} fx @param {{kind:SyncKind, [k:string]:any}} rec @returns {Effect} */
function sync(s, now, fx, rec) {
  return { type: 'sync', rec: { id: `${rec.kind}:${now}:${s.rev}:${fx.length}`, at: now, day: s.day.key, contextId: s.ctx ? s.ctx.id : null, ...rec } };
}

/** @param {EngineState} s */
function nudgeShowing(s) {
  return s.phase === 'intervened_l1' || s.phase === 'escalated_l2';
}

/** Bank accrued momentum up to `at` and stop the clock. Emits a `focus` sync with the delta. @param {EngineState} s @param {number} at @param {Effect[]} fx */
function bank(s, at, fx) {
  if (s.momentumSince === null) return;
  const d = Math.max(0, at - s.momentumSince) / S;
  s.momentumS += d;
  s.momentumSince = null;
  if (d > 0 && s.ctx) fx.push(sync(s, at, fx, { kind: 'focus', seconds: d })); // R32 shape; D rounds at upload
}

/** @param {EngineState} s @param {number} at @param {Effect[]} fx */
function resetMomentum(s, at, fx) {
  bank(s, at, fx);
  s.momentumS = 0;
}

/** Momentum runs only in `active`, on an in-context tab, while not paused. @param {EngineState} s @param {number} at */
function startMomentum(s, at) {
  if (s.phase === 'active' && s.momentumSince === null && s.pausedUntil === null && s.current && s.current.inCtx) s.momentumSince = at;
}

/** @param {EngineState} s @param {number} now */
export function momentumAt(s, now) {
  return s.momentumS + (s.momentumSince === null ? 0 : Math.max(0, now - s.momentumSince) / S);
}

/** @param {EngineState} s @param {number} tabId @param {string|null} host @param {string} title @param {number} at @param {Cfg} cfg @returns {Landing} */
function classify(s, tabId, host, title, at, cfg) {
  if (host === null) return { tabId, host, title, tier: 'unknown', inCtx: false, at };
  const seed = cfg.tables.seed;
  const tier = tierOf(host, s.ctx, seed, s.hints);
  const key = keyOf(host, seed);
  const inCtx = !!s.ctx && (tier === 'green' || s.ctx.groupTabIds.includes(tabId) || s.ctx.resources.some((r) => r.host === key));
  return { tabId, host, title, tier, inCtx, at };
}

// ── preamble ────────────────────────────────────────────────────────────────────

/** @param {EngineState} s @param {number} now @param {Cfg} cfg @param {Effect[]} fx */
function preamble(s, now, cfg, fx) {
  const key = dayKey(now, cfg.tz);
  if (!s.day.key) s.day.key = key;
  else if (key !== s.day.key) {
    // Slept (or the browser was closed) across midnight: focus stops at the last step seen, not at wake.
    if (s.ctx && now - s.lastSeenAt > cfg.SLEEP_GAP_S * S) bank(s, s.lastSeenAt, fx);
    if (s.ctx) endCtx(s, now, fx, 'day_rollover');
    s.day = { key, ignored: 0 };
  }
  if (s.pending && now - s.pending.ts >= cfg.DWELL_MIN_S * S) commitPending(s, now, cfg, fx);
  if (now - s.lastSeenAt > cfg.SLEEP_GAP_S * S) {
    fx.push(log('info', 'sleep_gap', { gapS: Math.round((now - s.lastSeenAt) / S) }));
    sleepReset(s, now, cfg, fx);
  }
  if (s.pausedUntil !== null && now >= s.pausedUntil) {
    s.pausedUntil = null;
    reland(s, now, cfg, fx);
  }
}

// ── landings ────────────────────────────────────────────────────────────────────

/** @type {Handler} */
function onLandingInput(s, i, now) {
  if (!Number.isInteger(i.tabId)) return;
  const host = i.host == null ? null : normalizeHost(i.host) || null;
  const title = host === null ? '' : String(i.title || '').slice(0, 120);
  const ts = Number.isFinite(i.ts) ? Math.min(i.ts, now) : now; // NaN/future would never commit
  if (s.pending && s.pending.tabId === i.tabId && s.pending.host === host) { s.pending.title = title; return; }
  if (!s.pending && s.current && s.current.tabId === i.tabId && s.current.host === host) { s.current.title = title; return; }
  s.pending = { tabId: i.tabId, host, title, ts };
}

/** @param {EngineState} s @param {number} now @param {Cfg} cfg @param {Effect[]} fx */
function commitPending(s, now, cfg, fx) {
  const p = /** @type {NonNullable<EngineState['pending']>} */ (s.pending);
  s.pending = null;
  s.current = classify(s, p.tabId, p.host, p.title, p.ts, cfg);
  onLanding(s, s.current, now, cfg, fx);
}

/** @type {Handler} */
function onHeartbeat(s, i, now, cfg, fx) {
  // Bank focus time each tick so the shell's daily totals stay current; skip while a landing is pending.
  if (i.reason === 'tick' && !s.pending && s.momentumSince !== null) { bank(s, now, fx); s.momentumSince = now; }
}

// ── evaluation & detection ──────────────────────────────────────────────────────

/** Re-evaluate `current` as if the user just landed on it. @param {EngineState} s @param {number} now @param {Cfg} cfg @param {Effect[]} fx */
function reland(s, now, cfg, fx) {
  if (!s.ctx || !s.current || s.idle) return; // idle/locked: no drift starts; the unlock (onIdle 'active') relands
  const c = s.current;
  s.current = classify(s, c.tabId, c.host, c.title, now, cfg);
  onLanding(s, s.current, now, cfg, fx);
}

/** @param {EngineState} s @param {Landing} L @param {number} now @param {Cfg} cfg @param {Effect[]} fx */
function onLanding(s, L, now, cfg, fx) {
  if (s.phase === 'idle') return detect(s, L, cfg, fx);
  if (s.phase === 'detected' || s.phase === 'on_break' || !s.ctx) return;
  if (s.pausedUntil !== null) return; // paused: every landing is blind
  if (L.inCtx) {
    // A tab that is in context only because it sits in the group is not a resource: drag-out must undo it.
    if (L.tier === 'green' || !s.ctx.groupTabIds.includes(L.tabId)) upsertResource(s, /** @type {string} */ (L.host), L.at, cfg, fx);
    if (L.tabId >= 0) s.ctx.lastTabId = L.tabId; // -1: `current` after a browser restart has no valid id
    // R5: a return after any shown nudge is a recovery, including one during an extended grace (l1At stays set).
    if (s.phase !== 'active') recover(s, /** @type {Drift} */ (s.drift).l1At !== null ? 'intervention' : 'self_returned', L.at, now, fx);
    startMomentum(s, L.at);
    return;
  }
  if (s.ctx.lastTabId === L.tabId) s.ctx.lastTabId = null; // this tab left the context: Back must not focus it
  if (s.phase !== 'active') return; // still away: deadline unchanged
  bank(s, L.at, fx);
  if (L.tier !== 'yellow' && L.tier !== 'red') return; // blind or unknown: trust
  if (cfg.beastUntil !== null && now < cfg.beastUntil) return;
  startDrift(s, L.tier, L.at, cfg, fx);
}

/** @param {EngineState} s @param {string} host @param {number} at @param {Cfg} cfg @param {Effect[]} fx */
function upsertResource(s, host, at, cfg, fx) {
  const ctx = /** @type {Ctx} */ (s.ctx);
  const key = keyOf(host, cfg.tables.seed);
  const r = ctx.resources.find((x) => x.host === key);
  if (r) { r.lastSeen = at; return; }
  ctx.resources.push({ host: key, lastSeen: at });
  if (ctx.resources.length > 20) ctx.resources = ctx.resources.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 20);
  fx.push(sync(s, at, fx, { kind: 'resource', host: key }));
}

/** @param {Landing} L */
const suppressKey = (L) => `${L.host}|${L.title}`;

/** @param {EngineState} s @param {Landing} L @param {Cfg} cfg @param {Effect[]} fx */
function detect(s, L, cfg, fx) {
  if (L.host === null || L.tabId < 0 || s.pausedUntil !== null) return; // tabId -1: no valid id to group (browser restart)
  if (L.tier !== 'green' && L.tier !== 'unknown') return;
  const m = matchHost(L.host, cfg.tables.seed);
  if (m && m.mode === 'personal') return;
  if (s.suppressed.includes(suppressKey(L))) return;
  propose(s, L, { title: m ? m.title : 'Focus session', mode: m ? m.mode : 'work' }, cfg, fx);
}

/** @param {EngineState} s @param {Landing} L @param {{title:string, mode:Mode}} suggested @param {Cfg} cfg @param {Effect[]} fx */
function propose(s, L, suggested, cfg, fx) {
  const host = /** @type {string} */ (L.host);
  s.proposal = { tabId: L.tabId, host, title: L.title, suggested, softAt: L.at + cfg.SOFT_CONFIRM_TIMEOUT_S * S };
  s.phase = 'detected';
  fx.push({ type: 'propose_context', host, title: L.title, suggested: { ...suggested } });
}

/** @param {any} m @returns {Mode|null} */
const validMode = (m) => (m === 'work' || m === 'learning' || m === 'personal' ? m : null);

/** @param {EngineState} s @param {'inferred'|'confirmed'} confidence @param {any} title @param {any} mode @param {number} now @param {Cfg} cfg @param {Effect[]} fx */
function activate(s, confidence, title, mode, now, cfg, fx) {
  const p = /** @type {Proposal} */ (s.proposal);
  const t = (typeof title === 'string' && title.trim() ? title.trim() : p.suggested.title).slice(0, 120);
  s.proposal = null;
  s.phase = 'active';
  s.momentumS = 0;
  s.momentumSince = null;
  // R7: ids match ^[A-Za-z0-9_-]{1,64}$ (B validates PUT /contexts/{id}); no '.'.
  s.ctx = { id: `c${now}_${s.rev}`, title: t, mode: validMode(mode) ?? p.suggested.mode, confidence, startedAt: now,
    groupId: null, groupTabIds: [], lastTabId: p.tabId, pendingGroupTabId: null, adoptNextGroup: false, adoptUntil: 0, relatedHosts: [], resources: [] };
  fx.push(sync(s, now, fx, { kind: 'context', title: t, mode: s.ctx.mode, confidence, startedAt: now }));
  upsertResource(s, p.host, now, cfg, fx);
  if (confidence === 'confirmed') {
    s.ctx.pendingGroupTabId = p.tabId; // only this tab's tab_group report may adopt a group (Task 10)
    fx.push({ type: 'group_tab', contextId: s.ctx.id, tabId: p.tabId, title: t });
  }
  reland(s, now, cfg, fx);
}

/** @type {Handler} */
function cmdConfirm(s, i, now, cfg, fx) {
  if (s.phase !== 'detected') return void fx.push(log('debug', 'ignored', { cmd: 'confirm', phase: s.phase }));
  activate(s, 'confirmed', i.title, i.mode, now, cfg, fx);
}

/** @type {Handler} */
function cmdCancel(s, i, now, cfg, fx) {
  if (s.phase !== 'detected' || !s.proposal) return void fx.push(log('debug', 'ignored', { cmd: 'cancel', phase: s.phase }));
  const p = s.proposal;
  s.suppressed = [...s.suppressed, `${p.host}|${p.title}`].slice(-50);
  s.proposal = null;
  s.phase = 'idle';
}

/** @param {EngineState} s @param {number} now @param {Cfg} cfg @param {Effect[]} fx */
function alarmSoftConfirm(s, now, cfg, fx) {
  activate(s, 'inferred', null, null, now, cfg, fx);
}

// ── drift ───────────────────────────────────────────────────────────────────────

/** @param {EngineState} s @param {'yellow'|'red'} tier @param {number} at @param {Cfg} cfg @param {Effect[]} fx */
function startDrift(s, tier, at, cfg, fx) {
  const graceS = graceFor(tier, s.momentumS, cfg);
  s.drift = { id: `d${at}_${s.rev}`, startedAt: at, anchor: at, deadline: at + graceS * S, graceS, tier,
    l1At: null, l2Due: null, extended: false, interventionId: null };
  s.phase = 'grace';
  fx.push(sync(s, at, fx, { kind: 'drift', driftId: s.drift.id, tier, graceS }));
}

/** R24 triggers; `break_ended` is emitted by `cmdResume` directly (no drift). @param {EngineState} s @param {'self_returned'|'intervention'} trigger @param {number} at @param {number} now @param {Effect[]} fx */
function recover(s, trigger, at, now, fx) {
  const d = /** @type {Drift} */ (s.drift);
  if (nudgeShowing(s)) fx.push({ type: 'hide_nudge' });
  fx.push(sync(s, now, fx, { kind: 'recovery', driftId: d.id, trigger, awayS: Math.round((at - d.startedAt) / S) }));
  s.drift = null;
  s.phase = 'active';
}

// ── nudges ──────────────────────────────────────────────────────────────────────

const fmtCache = new Map();
/** @param {string} tz @param {Intl.DateTimeFormatOptions} opts */
function fmt(tz, opts) {
  const k = tz + JSON.stringify(opts);
  if (!fmtCache.has(k)) {
    let f;
    try { f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }); }
    catch { f = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }); } // zone unknown to this Chrome's ICU: UTC, same as D's sync.dayKey; never throw
    fmtCache.set(k, f);
  }
  return fmtCache.get(k);
}
/** @param {number} now @param {string} tz @param {Intl.DateTimeFormatOptions} opts */
function parts(now, tz, opts) {
  /** @type {Record<string, string>} */ const o = {};
  for (const p of fmt(tz, opts).formatToParts(now)) o[p.type] = p.value;
  return o;
}

/** Local calendar day in `tz` as YYYY-MM-DD. @param {number} now @param {string} tz */
export function dayKey(now, tz) {
  const p = parts(now, tz, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** @param {number} now @param {Cfg} cfg */
export function inQuietHours(now, cfg) {
  const p = parts(now, cfg.tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const m = Number(p.hour) * 60 + Number(p.minute);
  /** @param {string} hhmm */
  const toMin = (hhmm) => { const [h, mm] = String(hhmm).split(':').map(Number); return h * 60 + mm; };
  return (cfg.quietHours || []).some(({ from, to }) => {
    const f = toMin(from), t = toMin(to);
    return f <= t ? m >= f && m < t : m >= f || m < t;
  });
}

/** @param {EngineState} s @param {number} now @param {Cfg} cfg @param {1|2} level @returns {string|null} */
function blockReason(s, now, cfg, level) {
  const c = s.current;
  if (cfg.beastUntil !== null && now < cfg.beastUntil) return 'beast';
  if (!c || c.host === null || c.inCtx || (c.tier !== 'yellow' && c.tier !== 'red')) return 'not_drifting';
  if (inQuietHours(now, cfg)) return 'quiet_hours';
  const cap = s.day.ignored >= cfg.IGNORES_BEFORE_REDUCE ? cfg.REDUCED_MAX_PER_HOUR : cfg.INTERVENTION_MAX_PER_HOUR;
  if (s.nudgeTimes.filter((t) => now - t < HOUR).length >= cap) return 'hourly_cap';
  const d = /** @type {Drift} */ (s.drift);
  if (level === 1 && !d.extended && s.lastL1At !== null && now - s.lastL1At < cfg.L1_MIN_GAP_S * S) return 'min_gap';
  return null;
}

/** @param {EngineState} s @param {1|2} level @param {number} now @param {Cfg} cfg @returns {Effect} */
function showNudge(s, level, now, cfg) {
  const d = /** @type {Drift} */ (s.drift), ctx = /** @type {Ctx} */ (s.ctx);
  return { type: 'show_nudge', level, interventionId: d.interventionId, copyKey: `nudge_l${level}`,
    vars: { context: ctx.title, awayMin: Math.round((now - d.startedAt) / 60000) },
    actions: [...NUDGE_ACTIONS], extendOptionsS: [...cfg.EXTEND_OPTIONS_S] };
}

/** @param {EngineState} s @param {number} now @param {Cfg} cfg @param {Effect[]} fx */
function alarmGrace(s, now, cfg, fx) {
  const d = /** @type {Drift} */ (s.drift), ctx = /** @type {Ctx} */ (s.ctx);
  const reason = blockReason(s, now, cfg, 1);
  if (reason) {
    fx.push(log('info', 'nudge_suppressed', { level: 1, reason }));
    fx.push(sync(s, now, fx, { kind: 'intervention', driftId: d.id, level: 1, suppressed: reason }));
    s.drift = null;
    s.phase = 'active';
    return;
  }
  d.l1At = now;
  d.l2Due = now + cfg.ESCALATION_DELAY_S * S;
  d.interventionId = `i${now}_${s.rev}`;
  s.nudgeTimes.push(now);
  s.lastL1At = now;
  s.phase = 'intervened_l1';
  resetMomentum(s, now, fx);
  fx.push({ type: 'persist_resume', contextId: ctx.id });
  fx.push(showNudge(s, 1, now, cfg));
  fx.push(sync(s, now, fx, { kind: 'intervention', driftId: d.id, interventionId: d.interventionId, level: 1, tier: d.tier }));
}

/** @param {EngineState} s @param {number} now @param {Cfg} cfg @param {Effect[]} fx */
function alarmEscalate(s, now, cfg, fx) {
  const d = /** @type {Drift} */ (s.drift);
  d.l2Due = null;
  const reason = blockReason(s, now, cfg, 2);
  if (reason) {
    fx.push(log('info', 'nudge_suppressed', { level: 2, reason }));
    fx.push(sync(s, now, fx, { kind: 'intervention', driftId: d.id, level: 2, suppressed: reason }));
    return;
  }
  d.interventionId = `i${now}_${s.rev}`; // own id: card cmd ids are `${interventionId}:${action}` (R36), so reusing L1's would dedupe L2 clicks
  s.nudgeTimes.push(now);
  s.day.ignored++;
  s.phase = 'escalated_l2';
  fx.push(showNudge(s, 2, now, cfg));
  fx.push(sync(s, now, fx, { kind: 'intervention', driftId: d.id, interventionId: d.interventionId, level: 2, tier: d.tier }));
}

// ── responses ───────────────────────────────────────────────────────────────────

const ACTIVE_PHASES = ['active', 'grace', 'intervened_l1', 'escalated_l2'];

/** @param {EngineState} s @param {number} now @param {Effect[]} fx @param {string} response @param {object} [extra] */
function respond(s, now, fx, response, extra) {
  const d = /** @type {Drift} */ (s.drift);
  fx.push(sync(s, now, fx, { kind: 'response', driftId: d.id, interventionId: d.interventionId, response, ...extra }));
}

/** @param {EngineState} s @param {number} now @param {Effect[]} fx @param {'end'|'day_rollover'|'new_task'} reason */
function endCtx(s, now, fx, reason) {
  const ctx = /** @type {Ctx} */ (s.ctx);
  if (nudgeShowing(s)) fx.push({ type: 'hide_nudge' });
  bank(s, now, fx);
  fx.push(sync(s, now, fx, { kind: 'session_end', reason, durS: Math.round((now - ctx.startedAt) / S) }));
  fx.push({ type: 'drop_resume', contextId: ctx.id });
  Object.assign(s, { ctx: null, drift: null, brk: null, proposal: null, phase: 'idle', momentumS: 0, momentumSince: null, hints: {} });
}

/** @type {Handler} */
function cmdBack(s, i, now, cfg, fx) {
  if (!nudgeShowing(s)) return void fx.push(log('debug', 'ignored', { cmd: 'back', phase: s.phase }));
  const ctx = /** @type {Ctx} */ (s.ctx);
  respond(s, now, fx, 'back');
  recover(s, 'intervention', now, now, fx);
  fx.push({ type: 'focus_tab', contextId: ctx.id, tabId: ctx.lastTabId });
}

/** @type {Handler} */
function cmdProgress(s, i, now, cfg, fx) {
  if (!nudgeShowing(s)) return void fx.push(log('debug', 'ignored', { cmd: 'progress', phase: s.phase }));
  fx.push({ type: 'show_progress', contextId: /** @type {Ctx} */ (s.ctx).id });
}

/** @type {Handler} */
function cmdExtend(s, i, now, cfg, fx) {
  if (!nudgeShowing(s) || !cfg.EXTEND_OPTIONS_S.includes(i.n)) return void fx.push(log('debug', 'ignored', { cmd: 'extend', phase: s.phase, n: i.n }));
  const d = /** @type {Drift} */ (s.drift);
  fx.push({ type: 'hide_nudge' });
  respond(s, now, fx, 'extend', { n: i.n });
  Object.assign(d, { anchor: now, deadline: now + i.n * S, graceS: i.n, extended: true, l2Due: null });
  s.phase = 'grace';
}

/** @type {Handler} */
function cmdDismiss(s, i, now, cfg, fx) {
  if (!nudgeShowing(s)) return void fx.push(log('debug', 'ignored', { cmd: 'dismiss', phase: s.phase }));
  fx.push({ type: 'hide_nudge' });
  respond(s, now, fx, 'dismiss');
  s.day.ignored++;
}

/** @type {Handler} */
function cmdRelated(s, i, now, cfg, fx) {
  const c = s.current;
  if (!ACTIVE_PHASES.includes(s.phase) || !s.ctx || !c || c.host === null) return void fx.push(log('debug', 'ignored', { cmd: 'related', phase: s.phase }));
  const key = keyOf(c.host, cfg.tables.seed);
  if (!s.ctx.relatedHosts.includes(key)) s.ctx.relatedHosts.push(key);
  if (nudgeShowing(s)) { fx.push({ type: 'hide_nudge' }); respond(s, now, fx, 'related'); }
  if (c.tabId >= 0) { // -1: `current` after a browser restart has no valid id to group
    if (s.ctx.groupId === null) s.ctx.pendingGroupTabId = c.tabId; // this tab's tab_group report may adopt a group (Task 10)
    fx.push({ type: 'group_tab', contextId: s.ctx.id, tabId: c.tabId, title: s.ctx.title });
  }
  fx.push(sync(s, now, fx, { kind: 'rule', host: key }));
  fx.push(log('info', 'false_positive', { tier: c.tier }));
  s.drift = null;
  s.phase = 'active';
  reland(s, now, cfg, fx);
}

/** R14: the user deleted a related-site rule in the popup. No sync record: D already removed it from `fg_rules`. @type {Handler} */
function cmdUnrelate(s, i, now, cfg, fx) {
  if (!s.ctx || typeof i.host !== 'string' || !normalizeHost(i.host)) return void fx.push(log('debug', 'ignored', { cmd: 'unrelate', phase: s.phase }));
  const key = keyOf(i.host, cfg.tables.seed);
  const before = s.ctx.relatedHosts.length + s.ctx.resources.length;
  s.ctx.relatedHosts = s.ctx.relatedHosts.filter((h) => h !== key);
  // `related` relanded the host as green, which made it a resource; classify() treats resources as in-context.
  s.ctx.resources = s.ctx.resources.filter((r) => r.host !== key);
  // ponytail: a tab D already grouped stays in context via groupTabIds until the user ungroups it; new tabs drift.
  if (s.ctx.relatedHosts.length + s.ctx.resources.length !== before) reland(s, now, cfg, fx);
}

/** @type {Handler} */
function cmdBreak(s, i, now, cfg, fx) {
  if (!ACTIVE_PHASES.includes(s.phase) || !s.ctx) return void fx.push(log('debug', 'ignored', { cmd: 'break', phase: s.phase }));
  if (nudgeShowing(s)) { fx.push({ type: 'hide_nudge' }); respond(s, now, fx, 'break'); }
  const note = typeof i.note === 'string' && i.note.trim() ? i.note.trim().slice(0, 200) : null;
  resetMomentum(s, now, fx);
  fx.push({ type: 'persist_resume', contextId: s.ctx.id });
  fx.push(sync(s, now, fx, { kind: 'break', hasNote: note !== null }));
  s.drift = null;
  s.brk = { startedAt: now, note };
  s.phase = 'on_break';
}

/** @type {Handler} */
function cmdResume(s, i, now, cfg, fx) {
  if (s.phase === 'on_break' && s.ctx && s.brk) {
    fx.push({ type: 'show_recovery', copyKey: 'welcome_back',
      vars: { context: s.ctx.title, note: s.brk.note, awayMin: Math.round((now - s.brk.startedAt) / 60000) } });
    if (s.ctx.groupId !== null) fx.push({ type: 'focus_tab', contextId: s.ctx.id, tabId: s.ctx.lastTabId });
    else { s.ctx.adoptNextGroup = true; s.ctx.adoptUntil = now + ADOPT_WINDOW_S * S; fx.push({ type: 'reopen_group', contextId: s.ctx.id }); } // D's reports for the recreated group are adopted (Task 10)
    // R5/R24: a resumed break counts in `recoveries`. awayS 0 keeps it out of longest_detour_s (R5: drift duration only).
    fx.push(sync(s, now, fx, { kind: 'recovery', driftId: null, trigger: 'break_ended', awayS: 0 }));
    s.brk = null;
    s.phase = 'active';
    s.current = null; // the shell is moving the user back; their next landing decides
    s.pausedUntil = null;
    return;
  }
  if (s.pausedUntil !== null) { s.pausedUntil = null; return reland(s, now, cfg, fx); } // no welcome back (§18 #17)
  fx.push(log('debug', 'ignored', { cmd: 'resume', phase: s.phase }));
}

/** @type {Handler} */
function cmdEnd(s, i, now, cfg, fx) {
  if (s.ctx) endCtx(s, now, fx, 'end');
  else if (s.phase === 'detected') { s.proposal = null; s.phase = 'idle'; return; }
  else return void fx.push(log('debug', 'ignored', { cmd: 'end', phase: s.phase }));
  if (s.current) { s.current = classify(s, s.current.tabId, s.current.host, s.current.title, now, cfg); detect(s, s.current, cfg, fx); }
}

/** @type {Handler} */
function cmdNewTask(s, i, now, cfg, fx) {
  if (!ACTIVE_PHASES.includes(s.phase) || !s.ctx) return void fx.push(log('debug', 'ignored', { cmd: 'new_task', phase: s.phase }));
  if (nudgeShowing(s)) respond(s, now, fx, 'new_task');
  endCtx(s, now, fx, 'new_task');
  const c = s.current;
  if (!c || c.host === null || c.tabId < 0) return; // blind, or no valid tab id after a browser restart
  s.current = classify(s, c.tabId, c.host, c.title, now, cfg);
  const m = matchHost(c.host, cfg.tables.seed);
  const title = typeof i.title === 'string' && i.title.trim() ? i.title.trim().slice(0, 120) : null;
  propose(s, s.current, { title: title ?? (m ? m.title : 'Focus session'), mode: m ? m.mode : 'work' }, cfg, fx);
  if (title) activate(s, 'confirmed', title, null, now, cfg, fx);
}

// ── pause / idle / sleep ────────────────────────────────────────────────────────

/** Drop any drift without a trace (pause, idle, sleep). @param {EngineState} s @param {Effect[]} fx */
function dropDrift(s, fx) {
  if (nudgeShowing(s)) fx.push({ type: 'hide_nudge' });
  s.drift = null;
  if (s.phase === 'grace' || s.phase === 'intervened_l1' || s.phase === 'escalated_l2') s.phase = 'active';
}

/** @type {Handler} */
function cmdPause(s, i, now, cfg, fx) {
  if (typeof i.until !== 'number' || !(i.until > now)) return void fx.push(log('debug', 'ignored', { cmd: 'pause', until: i.until }));
  dropDrift(s, fx);
  resetMomentum(s, now, fx);
  if (s.phase === 'detected') { s.proposal = null; s.phase = 'idle'; }
  s.pausedUntil = Math.min(i.until, Number.MAX_SAFE_INTEGER);
}

/** Laptop slept, browser was closed, or an alarm came in stale: forget the drift, start fresh. @param {EngineState} s @param {number} now @param {Cfg} cfg @param {Effect[]} fx */
function sleepReset(s, now, cfg, fx) {
  if (!s.ctx) return;
  dropDrift(s, fx);
  resetMomentum(s, Math.min(now, s.lastSeenAt), fx);
  reland(s, now, cfg, fx);
}

/** @type {Handler} */
function onIdle(s, i, now, cfg, fx) {
  if (i.state === 'active') {
    if (!s.idle) return;
    s.idle = false;
    return reland(s, now, cfg, fx);
  }
  if (i.state !== 'idle' && i.state !== 'locked') return void fx.push(log('debug', 'ignored', { idle: i.state }));
  if (s.idle) return;
  s.idle = true;
  if (!s.ctx) return;
  dropDrift(s, fx);
  resetMomentum(s, now, fx);
}

// ── shell-reported inputs ───────────────────────────────────────────────────────

/** @type {Handler} */
function onTabGroup(s, i, now, cfg, fx) {
  const ctx = s.ctx;
  if (!ctx || typeof i.groupId !== 'number') return;
  if (i.removed) {
    if (ctx.groupId !== i.groupId) return;
    ctx.groupId = null;
    ctx.groupTabIds = [];
  } else if (typeof i.tabId === 'number') {
    // Adopt only the group D made for the tab we asked to group (R23 reports every group change, including the user's own).
    // After reopen_group (break resume), the first report is the group D just recreated.
    if (ctx.groupId === null && i.groupId >= 0 && (i.tabId === ctx.pendingGroupTabId || (ctx.adoptNextGroup && now <= ctx.adoptUntil))) {
      ctx.groupId = i.groupId;
      ctx.pendingGroupTabId = null;
      ctx.adoptNextGroup = false;
    }
    if (i.groupId === ctx.groupId) { if (!ctx.groupTabIds.includes(i.tabId)) ctx.groupTabIds.push(i.tabId); }
    else ctx.groupTabIds = ctx.groupTabIds.filter((t) => t !== i.tabId);
  } else return;
  reland(s, now, cfg, fx);
}

/** @type {Handler} */
function onTierHint(s, i) {
  const host = normalizeHost(i.host);
  if (!host || (i.tier !== 'green' && i.tier !== 'yellow' && i.tier !== 'red')) return;
  const keys = Object.keys(s.hints);
  if (keys.length >= 200 && !Object.hasOwn(s.hints, host)) delete s.hints[keys[0]];
  s.hints[host] = { tier: i.tier, related: i.related === true };
}

// ── view ────────────────────────────────────────────────────────────────────────

/** @param {EngineState} s @param {number} now */
export function view(s, now) {
  const c = s.ctx;
  return {
    phase: s.phase,
    context: c ? { id: c.id, title: c.title, mode: c.mode, confidence: c.confidence, startedAt: c.startedAt,
      inContextMin: Math.floor((now - c.startedAt) / 60000) } : null, // R35: wall-clock minutes, not momentum
    drift: s.drift && s.phase !== 'active' ? { deadline: s.drift.deadline, tier: s.drift.tier } : null,
    pausedUntil: s.pausedUntil !== null && s.pausedUntil > now ? s.pausedUntil : null,
    onBreak: s.brk ? { startedAt: s.brk.startedAt, note: s.brk.note } : null,
    proposal: s.proposal ? { host: s.proposal.host, title: s.proposal.title, suggested: { ...s.proposal.suggested } } : null,
  };
}

// ── dispatch ────────────────────────────────────────────────────────────────────

/** @type {Record<string, (s:EngineState, now:number, cfg:Cfg, fx:Effect[]) => void>} */
const ALARMS = { soft_confirm: alarmSoftConfirm, grace: alarmGrace, escalate: alarmEscalate };

/** @type {Handler} */
function onAlarm(s, i, now, cfg, fx) {
  if (alarmsFor(s)[i.kind] !== i.dueAt || !Object.hasOwn(ALARMS, i.kind)) {
    return void fx.push(log('debug', 'alarm_ignored', { kind: i.kind }));
  }
  if ((i.kind === 'grace' || i.kind === 'escalate') && s.pending) {
    // The user already moved on (landing still in its dwell): decide on where they are, not where they were.
    commitPending(s, now, cfg, fx);
    if (alarmsFor(s)[i.kind] !== i.dueAt) return void fx.push(log('debug', 'alarm_ignored', { kind: i.kind, reason: 'landing' }));
  }
  if ((i.kind === 'grace' || i.kind === 'escalate') && now - i.dueAt > cfg.STALE_ALARM_S * S) {
    fx.push(log('info', 'stale_alarm', { kind: i.kind, lateS: Math.round((now - i.dueAt) / S) }));
    return sleepReset(s, now, cfg, fx);
  }
  ALARMS[i.kind](s, now, cfg, fx);
}

/** @type {Record<string, Handler>} */
const CMDS = {
  confirm: cmdConfirm, cancel: cmdCancel, back: cmdBack, progress: cmdProgress, extend: cmdExtend,
  dismiss: cmdDismiss, related: cmdRelated, unrelate: cmdUnrelate, break: cmdBreak, resume: cmdResume, end: cmdEnd,
  new_task: cmdNewTask, pause: cmdPause,
};

/** @type {Handler} */
function onCmd(s, i, now, cfg, fx) {
  if (typeof i.cmd !== 'string' || !Object.hasOwn(CMDS, i.cmd)) return void fx.push(log('info', 'unknown_cmd', { cmd: i.cmd }));
  if (s.pending && (i.cmd === 'related' || i.cmd === 'new_task' || i.cmd === 'end')) commitPending(s, now, cfg, fx); // act on the tab the user is on, not the one before a 4 s dwell
  CMDS[i.cmd](s, i, now, cfg, fx);
}

/** @type {Record<string, Handler>} */
const HANDLERS = {
  landing: onLandingInput, heartbeat: onHeartbeat, cmd: onCmd, alarm: onAlarm,
  idle: onIdle, tab_group: onTabGroup, tier_hint: onTierHint,
};
