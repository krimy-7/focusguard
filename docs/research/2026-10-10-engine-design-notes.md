# Drift engine: design notes (input to the spec, not the spec)

Date: 2026-10-10. Inputs: `docs/SPEC.md` §3, §6 to §11, §16.5, §17 to §19; `docs/DECISIONS.md` D-1 to D-7; `docs/STATUS_AUDIT.md`; `extension/*.js`; `backend/app/services/context_engine.py`; `backend/app/routers/contexts.py`. Platform facts come from `docs/research/2026-10-10-chrome-platform.md`. Nothing here is decided until the maintainer approves it.

## 1. Where the engine runs

| | **A: extension service worker** | **B: FastAPI server** |
|---|---|---|
| Timers | `chrome.alarms` with absolute `when` (30s minimum since Chrome 120; shortest timer is 60s). Re-derived from state on startup (alarms may not survive a restart before Chrome 150). 4s dwell computed lazily. | Durable scheduler (APScheduler, arq or Redis), one job per drift. A fired timer must still reach the browser: a live WSS keeping the worker awake (Chrome 116+, message every <30s) or polling. |
| Offline | Fully works. Records queue and sync later. | No nudges offline unless we also ship the "local fallback" from §14.3, which is a second engine in JS. |
| Latency | No network on the critical path. | Batch, send, step, push back per landing. Fine for minute-scale grace; popup state lags. |
| Privacy (what leaves the browser) | Context title and mode, in-context resources (host plus sanitized label), drift, intervention and recovery records (tier and timings). **The drift destination never needs to leave.** | Every committed landing (host plus sanitized title), in near real time: a `focus_events` table, a 7-day purge job, a broader Web Store disclosure. |
| Multi-device (v1.1 mobile) | Extension is the authority for its browser profile (matches §18 #15). The server keeps a mirror snapshot (`rev`). Phone commands ("take a break") queue on the server; the extension pulls them on heartbeat or WSS and applies them through `step()`. Idle transitions go up as records; the server pushes the phone check-in. | Natural fit for P9 and §17: one authority, `version`, first response wins. Two desktops share one context. |
| Testability | Pure ES module, `node --test`, JSON traces. | Pure Python, pytest, same traces, plus scheduler/WSS/restart integration tests. |
| Taxonomy reuse | `_TAXONOMY` becomes one JSON seed read by both sides (§3). `detect_context` naming stays server-side as optional async title refinement; the engine never waits on it. | Imports `context_engine.py` directly. |
| Ops | No server work per tab switch; backend outage invisible to the loop. | Per-user timers, WSS fan-out and Redis before v1. |
| Spec fit | Contradicts P9 and §17 ("server authoritative"). It matches STATUS_AUDIT Q-1 and O-1. | Matches P9 and §17 as written. |

**Recommendation: A.** Timers, nudges and resume all happen in the browser. B needs a JS fallback engine anyway (§14.3) and ships the most data off-device. This needs a decision record that amends P9, §5, §8.2 and §17 (open question 1).

**Build step: none.** Declare `"background": {"service_worker": "background.js", "type": "module"}`.
- `importScripts` goes away and becomes `import`. Dynamic `import()` is not allowed in service workers, so the optional `config.local.js` changes to `config.local.json`, read with `fetch(chrome.runtime.getURL(...))` inside a try/catch.
- `content.js` stays a classic script. It never needs the engine.
- Types come from `// @ts-check` plus JSDoc, checked by the TypeScript already in the root devDependencies (`tsc --noEmit -p extension/jsconfig.json`). No `.ts` sources and no bundler. Add a bundler only if the extension ever needs npm dependencies.
- Tests run with `node --test extension/engine`. That needs an `extension/package.json` of `{"type":"module"}`; Chrome ignores the file, but check that Metro doesn't crawl it.

## 2. Engine API (option A)

```js
// extension/engine/step.js — pure: no chrome.*, no Date.now(), no fetch, no randomness.
/** @returns {{state: EngineState, effects: Effect[]}} */
export function step(prev, input, now, cfg) {
  const s = structuredClone(prev), fx = [];
  preamble(s, input, now, cfg, fx); // sleep-gap reset, day rollover, pause expiry, commit pending landing
  HANDLERS[input.type](s, input, now, cfg, fx);
  s.lastSeenAt = now;
  fx.push(...diffAlarms(alarmsFor(prev), alarmsFor(s))); // the only source of schedule/cancel effects
  return { state: s, effects: fx };
}
```

The shell, `background.js`, is the only impure part. It serializes inputs through a promise queue: load state, run `step`, **persist the state, then run the effects**. The current code has a race because its listeners don't `await loadState()`, and this ordering fixes it. If the worker dies mid-effects, the startup `heartbeat` re-derives the alarms. A lost `show_nudge` is acceptable; a duplicate one is not. State persistence is implicit on every step, so the only `Persist*` effects concern the resume target.

Timestamps are epoch ms. Config values named `*_S` are in seconds. Ids are built from `now` and `rev`, so they stay deterministic.

### 2.1 Config

```js
export const DEFAULTS = Object.freeze({
  // SPEC §16.5
  GRACE_DEFAULT_S: 300, GRACE_MIN_S: 60, GRACE_MAX_S: 900,
  DWELL_MIN_S: 4, ROLLING_WINDOW_S: 60, VELOCITY_PAGES_HIGH: 5, // velocity: v1.1 (audit §5); unused in v1
  ESCALATION_DELAY_S: 300, INACTIVITY_THRESHOLD_S: 600,          // inactivity is given to chrome.idle.setDetectionInterval
  INTERVENTION_MAX_PER_HOUR: 3, L1_MIN_GAP_S: 600, EXTEND_OPTIONS_S: [120, 300, 600],
  SOFT_CONFIRM_TIMEOUT_S: 90, RAW_RETENTION_DAYS: 7, COLD_START_DAYS: 3, // the last two are server-side only
  // SPEC §9.4 / D-3
  MOMENTUM_MID_MIN: 20, MOMENTUM_HIGH_MIN: 45,
  MOMENTUM_FACTOR: { low: 1.0, mid: 0.7, high: 0.4 }, HIGH_MOMENTUM_FLOOR_S: 120,
  RISK_FACTOR: { yellow: 1.2, red: 1.0 },
  // engine-local
  STALE_ALARM_S: 90, SLEEP_GAP_S: 180, HEARTBEAT_S: 60,
  IGNORES_BEFORE_REDUCE: 3, REDUCED_MAX_PER_HOUR: 1, // §10.2 "reduce frequency"
});
/** cfg = {...DEFAULTS, ...userPrefs, tz: 'Asia/Kathmandu', quietHours: [{from:'22:00', to:'07:00'}],
 *         beastUntil: number|null, tables: {seed, cache}}  — rebuilt by the shell for each step; read-only. */
```

### 2.2 State

```js
/** @typedef {'idle'|'detected'|'active'|'grace'|'intervened_l1'|'escalated_l2'|'on_break'} Phase
 *  ('recovered' is transient: emitted as a sync record, then the state is 'active'. 'ended' becomes 'idle'.)
 * @typedef {'green'|'yellow'|'red'|'unknown'} Tier          // 'sensitive' never reaches the engine
 * @typedef {{tabId:number, host:string|null, title:string, tier:Tier, inCtx:boolean, at:number}} Landing
 *   // host === null is a "blind" landing: sensitive, incognito, chrome://, or no focused window
 * @typedef {{id:string, title:string, mode:'work'|'learning'|'personal', confidence:'inferred'|'confirmed',
 *   startedAt:number, groupId:number|null, groupTabIds:number[], lastTabId:number|null,
 *   relatedHosts:string[],                                    // "this is related" rules, this context only
 *   resources:{host:string, label:string, lastSeen:number, visits:number}[] }} Ctx   // at most 20, in-context only
 * @typedef {{id:string, startedAt:number, anchor:number, deadline:number, graceS:number,
 *   tier:'yellow'|'red', l1At:number|null, l2Due:number|null, extended:boolean}} Drift  // no destination host
 * @typedef {{
 *   v:1, rev:number, phase:Phase, ctx:Ctx|null,
 *   proposal:{host:string, title:string, mode:string, softAt:number}|null,
 *   suppressed:string[],                     // `${host}|${cleanTitle}` cancelled this browser session
 *   pending:{tabId:number, host:string|null, title:string, ts:number}|null,  // not yet DWELL_MIN_S
 *   current:Landing|null, drift:Drift|null,
 *   momentumS:number, momentumSince:number|null,  // accrues only while phase=active && current.inCtx
 *   nudgeTimes:number[], lastL1At:number|null,     // pruned to the last hour
 *   day:{key:string, ignored:number},
 *   pausedUntil:number|null, brk:{startedAt:number, note:string|null}|null,
 *   idle:boolean, lastSeenAt:number }} EngineState */
```

### 2.3 Inputs and effects

```js
/** @typedef {
 * | {type:'landing', tabId:number, host:string|null, title:string, ts:number}   // title already sanitized
 * | {type:'tab_group', tabId:number|null, groupId:number, removed?:boolean}      // tabs.onUpdated groupId / tabGroups.onRemoved
 * | {type:'cmd', id?:string, cmd:'confirm', title?:string, mode?:string}
 * | {type:'cmd', id?:string, cmd:'cancel'|'back'|'progress'|'related'|'dismiss'|'resume'|'end'}
 * | {type:'cmd', id?:string, cmd:'extend', n:number}
 * | {type:'cmd', id?:string, cmd:'break', note?:string}
 * | {type:'cmd', id?:string, cmd:'pause', until:number}       // Number.MAX_SAFE_INTEGER = "off"
 * | {type:'alarm', kind:'grace'|'escalate'|'soft_confirm'|'pause_end', dueAt:number}  // dueAt = Alarm.scheduledTime
 * | {type:'idle', state:'active'|'idle'|'locked'}
 * | {type:'heartbeat', reason:'tick'|'dwell'|'startup'}       // 60s periodic alarm while a context exists
 * } EngineInput
 * @typedef {
 * | {type:'schedule_alarm', kind:string, at:number} | {type:'cancel_alarm', kind:string}
 * | {type:'show_nudge', level:1|2, interventionId:string, copyKey:string,
 *    vars:{context:string, awayMin:number}, actions:string[], extendOptionsS:number[]}
 * | {type:'hide_nudge'} | {type:'show_progress', contextId:string}
 * | {type:'show_recovery', copyKey:'welcome_back', vars:{context:string, note:string|null, awayMin:number}}
 * | {type:'propose_context', host:string, title:string, suggested:{title:string, mode:string}}
 * | {type:'group_tab', contextId:string, tabId:number, title:string}   // create the group or add to it
 * | {type:'focus_tab', contextId:string, tabId:number|null} | {type:'reopen_group', contextId:string}
 * | {type:'persist_resume', contextId:string} | {type:'drop_resume', contextId:string}
 * | {type:'sync', rec:{id:string, kind:'context'|'resource'|'drift'|'intervention'|'response'|'recovery'|'break'|'rule'|'session_end', ...}}
 * | {type:'log', level:'debug'|'info', msg:string, data?:object}
 * } Effect */
```

Rules for the inputs:
- **Alarm idempotency.** An `alarm` whose `dueAt !== alarmsFor(state)[kind]` is a cancelled or duplicate alarm and is ignored. That gives §19.2 #5 for free. Remote commands carry an `id`, and the engine keeps the last 20 in a ring.
- **Stale alarms (§18 #12).** If `now - dueAt > STALE_ALARM_S`, the engine runs `sleepReset`: drop the drift silently, set momentum to 0, then `reland`. It never nudges.
- **Sleep gap.** Heartbeats arrive every 60s while the machine is awake. Any input with `now - lastSeenAt > SLEEP_GAP_S` therefore means sleep or a closed browser, and it gets the same `sleepReset`.
- **`reland(s, now)`.** Re-evaluates `current` as if the user just landed on it, giving a fresh grace. It runs after resume, pause end, idle→active, sleep reset and group-membership changes.

### 2.4 Grace

```js
export function graceFor(tier, momentumS, cfg) {
  const base = cfg.GRACE_DEFAULT_S, min = momentumS / 60;
  const m = min > cfg.MOMENTUM_HIGH_MIN ? 'high' : min >= cfg.MOMENTUM_MID_MIN ? 'mid' : 'low';
  let g = base * cfg.MOMENTUM_FACTOR[m] * cfg.RISK_FACTOR[tier];   // baseline × velocity = 1.0 in v1
  if (m === 'high') g = Math.max(g, Math.min(cfg.HIGH_MOMENTUM_FLOOR_S, base)); // floor never exceeds base (D-3)
  return Math.round(Math.min(cfg.GRACE_MAX_S, Math.max(cfg.GRACE_MIN_S, g)));
}
```

Worked results at base 300: red after 60 min gives 120; red after 30 min gives 210; yellow after 5 min gives 360; yellow after 60 min gives 144. At base 60, high momentum gives 60, so the floor never lengthens grace.

**Momentum** is computed lazily as `momentumS + (now - momentumSince)`.
- It accrues only in `active` while `current.inCtx` is true.
- It freezes during grace, blind or unknown tabs, and pause.
- It resets on L1, break, idle, sleep, pause, end and confirm.
- A self-return **does not** reset it (open question 2).

The drift deadline is anchored to the landing's arrival time, `pending.ts`, not to the debounce commit. It changes only on `extend`.

### 2.5 Transition table (SPEC §8.1 mapped to inputs)

| From | Input | Guard | To | Effects |
|---|---|---|---|---|
| idle | landing | tier green/unknown, seed mode ≠ personal, not suppressed, not paused | detected | `propose_context`; soft_confirm at +90s |
| detected | cmd confirm | — | active (confirmed) | `group_tab`; sync context and resource; momentum starts |
| detected | alarm soft_confirm | — | active (inferred) | sync context; **no** `group_tab` (no surprise tab moves) |
| detected | cmd cancel | — | idle | add to `suppressed` |
| active | landing inCtx | — | active | resource upsert (sync is deduped per host) |
| active | landing unknown/blind | — | active | none; momentum pauses |
| active | landing yellow/red | not paused, no Beast Mode | grace | drift `{startedAt: ts, deadline: ts + graceFor()}` |
| grace | landing inCtx | — | active | sync recovery `self_returned`, `awayS` |
| grace | landing other | — | grace | none; **deadline unchanged** |
| grace | alarm grace | fresh; hourly cap; L1 gap (waived after extend); outside quiet hours | intervened_l1 | `show_nudge` L1; escalate at +300s; `persist_resume`; sync intervention; momentum 0 |
| grace | alarm grace | blocked | active | log and sync `suppressed{reason}`; not queued |
| l1 / l2 | cmd back | — | active | `hide_nudge`; `focus_tab`; sync response and recovery |
| l1 / l2 | landing inCtx | — | active | `hide_nudge`; sync recovery `intervention` |
| l1 | cmd progress | — | l1 | `show_progress` |
| l1 / l2 | cmd extend n | n ∈ EXTEND_OPTIONS_S | grace | `anchor=now`, `deadline=now+n`, `extended=true`; does **not** count as ignored |
| l1 | alarm escalate | fresh; hourly cap; outside quiet hours | escalated_l2 | `show_nudge` L2; `day.ignored++` |
| l1 / l2 | cmd dismiss | — | same | `hide_nudge`; `day.ignored++`; nothing fires after L2 |
| active, grace, l1, l2 | cmd related | `current.host` set | active | add to `relatedHosts`; `group_tab(current.tabId)`; sync rule; `hide_nudge`; log `false_positive` |
| active, grace, l1, l2 | cmd break (note) | — | on_break | `persist_resume`; sync break; `hide_nudge`; momentum 0 |
| on_break | landing | — | on_break | none |
| on_break | cmd resume | — | active | `show_recovery` (note first); `focus_tab` if `groupId`, else `reopen_group`; `reland` |
| any with ctx | cmd pause(until) | — | active, paused | drop drift silently; `hide_nudge`; landings treated as blind |
| paused | alarm pause_end / cmd resume | — | active | **no** welcome back (§18 #17); `reland` |
| any with ctx | idle idle/locked · sleep gap · stale alarm | — | active | drop drift silently; momentum 0 |
| any with ctx | idle active | — | active | `reland` |
| any with ctx | cmd end / local-day rollover | — | idle | sync `session_end`; `drop_resume` |
| any with ctx | tab_group | — | — | update `groupTabIds` / `groupId`; `reland` |

Caps are checked against `nudgeTimes` within the last hour. Both L1 and L2 count toward the hourly cap. The minimum gap applies between L1s. Once `day.ignored ≥ 3`, the cap drops to 1 per hour. Quiet hours use `Intl.DateTimeFormat` with `cfg.tz`, which is deterministic for a given zone.

## 3. Tier lookup

Order: **sensitive (in the adapter) → user rule → seed → cache → unknown, which means trust.**

SPEC §9.2 puts the user rule first. I moved the sensitive check ahead of it so no user rule can ever pull a bank into the pipeline; user rules may only *add* exclusions (open question 3).

`tabToInput(tab)` is a pure adapter. It applies `isSensitiveHost`, the incognito check and the `chrome://` check, emitting `host: null`, and it applies `sanitizeTitle`. The engine therefore never sees a sensitive host, which makes §19.2 #6 testable as "the serialized state and effects never contain it".

`inCtx` is true when any of these hold:
- the tab is in `groupTabIds`
- the host matches `relatedHosts`
- the tier is green
- the host is already in `ctx.resources` (§7.3 b)

The cache is v1.1. v1 sends no unknown hosts anywhere (open question 5).

**Seed format.** This is `extension/engine/domains.json`, the single source of truth. `context_engine.py` loads the same file, and a backend test asserts parity.

```json
{ "version": 1,
  "labels":  { "code":   {"tier": "green",  "mode": "work",     "title": "Programming"},
               "video":  {"tier": "yellow", "mode": "learning", "title": "Learning from videos"},
               "social": {"tier": "red",    "mode": "personal", "title": "Social media"} },
  "domains": { "github.com":    {"label": "code", "keywords": ["github", "repo", "pull request"]},
               "pinterest.com": {"label": "social", "tier": "yellow"} } }
```

Matching uses the **longest suffix**. The Python `registrable_domain` uses dict insertion order, so `news.google.com` currently resolves to `google.com` (search, work). I verified that bug by running the function.

| Tier | Taxonomy labels |
|---|---|
| green | code, notes, docs, files, research, design, planning, assistant, search, dev, calendar, course |
| yellow | video, article, reference, language, chat, email, professional, news, shopping, music |
| red | social, browsing, streaming |

Per-domain overrides:
- `pinterest.com` is yellow. It is the spec's own design-reference example (§7.3, §11.2).
- `discord.com` is yellow (label chat, mode personal).

Email and chat are yellow rather than green because they join *every* context otherwise. The 1.2 risk factor gives them 6 minutes.

## 4. Contexts as Chrome tab groups

- **On explicit confirm,** `group_tab` makes the shell run `tabs.group` and then `tabGroups.update({title, color})`. The shell reports the result as `tab_group`, and the engine stores `groupId`. Soft-confirmed contexts get no group until the user confirms.
- **"Related"** adds a domain rule scoped to this context, then `group_tab` moves the current tab into the group.
- **Drag in:** the tab joins `groupTabIds`, so that tab counts as in-context. No domain rule is created, because a drag is housekeeping and not a permanent preference. If the user was in grace on that tab, `reland` makes it a self-return.
- **Drag out:** the tab is removed from `groupTabIds`, then `reland`. Domain rules stay; they are removed in Settings.
- **Natively, Chrome adds tabs opened from a grouped tab to the same group,** so research spirals stay in context with no code.
- **Group closed** (`tabGroups.onRemoved`): `groupId` becomes null and the context continues. Group ids don't survive a browser restart, so the startup heartbeat clears them.

**Resume target.** It lives in `chrome.storage.local` only, is never synced, and is deleted on `drop_resume` (§11.2, §15.1). The shell writes it on `persist_resume`, which fires on break and on L1.

```js
// key `fg_resume:${contextId}`
/** @typedef {{contextId:string, savedAt:number, windowId:number, groupId:number|null,
 *   title:string, color:string, lastTabId:number|null, lastUrl:string|null,
 *   tabs:{url:string, title:string, pinned:boolean}[]}} ResumeTarget   // tabs: at most 20 */
```

`focus_tab` tries `lastTabId` first, then a tab whose URL equals `lastUrl`, and finally `reopen_group`, which runs `tabs.create`, then `tabs.group`, then `tabGroups.update`. Full URLs exist only here, never in engine state.

## 5. Mapping from today's `background.js`

**Replaced:** the `distractionState` machine (`startDistraction`, `resetWatchdog`, `armWatchdog`, `cancelWatchdog`, `handleWatchdogElapsed`, `triggerLevel1/2`, `extendTimer`, `backToWork`, `seeProgress`, `takeBreak`); classification (`evaluateWatchdog`, `isContextDomain`, `classifyActivity`, `markRelated`, `groupActiveContext`, `maybeDetectContext`, `proposeNewContext`); `domainTopic` and `fallbackProposal` (seed JSON instead; their `x\.com` regex also matches `dropbox.com`); per-tab `/api/events` and `/api/sessions` posts in `flushActiveTab` (sync records instead); `content.js` `WATCHDOG_*` timers and `visibilitychange` logging; popup reads of `distractionState` (`phase` instead).

**Kept:** `privacy.js` (`isSensitiveHost`, `sanitizeTitle`) as ESM exports inside `tabToInput`; `hostnameOf`/`normalizeDomain`; `api`/`post` as the sync executor; `/api/contexts/detect` as optional async title refinement; `notifyContext` as the proposal renderer and `content.js` `SHOW_INTERVENTION` as the nudge renderer until Phase 3; Beast Mode (`syncBeast`, `isBlocked`, `enforceBlocking`) untouched until the `declarativeNetRequest` rewrite (the engine only reads `cfg.beastUntil`).

**Migration order.** Each step ships and leaves the extension working.

1. **Tooling.** Add `extension/package.json` (type module), `jsconfig.json` with checkJs, and the `privacy.js` self-check as `node --test`. No behavior change.
2. **Engine and traces.** Add `extension/engine/{step.js, tiers.js, domains.json, replay.test.js, traces/*.json}` and get all 20 traces green. Nothing is wired yet.
3. **ES module worker.** Switch the manifest background to `"type": "module"` and replace `importScripts` with imports and `config.local.json`. Behavior unchanged; smoke test by hand.
4. **Shadow mode.** Add `alarms` and `idle` permissions, `dispatch()` and `tabToInput`. The engine runs on real events, but its effects are only logged. The old flow still drives the UI. Dogfood for a day and compare.
5. **Cut over timers and nudges.** `schedule_alarm` goes to `chrome.alarms`. `show_nudge` goes to the existing `SHOW_INTERVENTION`. `focus_tab` uses `ctx.lastTabId`. Delete the watchdog functions and content-script timers. The popup reads `phase`.
6. **Cut over detection and proposal.** Route confirm and cancel through `dispatch`, and delete `maybeDetectContext`, `classifyActivity`, `domainTopic` and `fallbackProposal`.
7. **Sync executor.** Records are batched and made idempotent by `rec.id`. Fix `/api/sync` dropping `context_recovery` events. Remove the per-tab posts.

Phase 3 (corner card, `tabGroups` permission, the "related" button, resume, notes, pause UI) only adds shell executors. The engine already emits these effects.

## 6. Replay traces

**Harness.**
- `P` is a shared prefix: `{t:0, tab:1, url:"https://www.figma.com/file/x", title:"Landing v3 – Figma"}`, `{t:10, cmd:"confirm"}`. The landing commits at t=4, the context is proposed, and confirm makes it active with momentum starting at 10.
- Raw tabs go through `tabToInput`.
- The harness injects heartbeats every 60s, delivers alarms at their `at`, and runs to `until` (default: last event + 5s, so the final landing commits). While asleep, alarms are delivered late, on wake, with their original `dueAt`.
- `restart` round-trips the state through JSON, clears alarms and sends `heartbeat startup`.
- Every trace also asserts the §19.2 invariants:
  - no L1 before `anchor + graceS`
  - no nudge while on_break, paused or in Beast Mode, or while the current tab is green or blind
  - no more than the cap in any rolling hour
  - the deadline moves only on extend
  - duplicate inputs are no-ops
  - no sensitive string appears in the serialized output
- A seeded random-trace property test checks the same invariants.

```jsonc
[
{"name":"red_visit_returns_before_grace","events":["P",{"t":600,"tab":2,"url":"https://reddit.com/r/x"},{"t":780,"tab":1}],
 "expect":{"nudges":[],"phase":"active","alarm":{"grace":900},"has":[{"sync":"recovery","trigger":"self_returned","awayS":180}]}},
{"name":"high_momentum_grace_120","until":3731,"events":["P",{"t":3610,"tab":2,"url":"https://reddit.com"}],
 "expect":{"alarm":{"grace":3730,"escalate":4030},"nudges":[[1,3730]],"phase":"intervened_l1"}},
{"name":"mid_momentum_grace_210","events":["P",{"t":1810,"tab":2,"url":"https://reddit.com"}],"expect":{"alarm":{"grace":2020}}},
{"name":"yellow_low_momentum_360","events":["P",{"t":310,"tab":2,"url":"https://youtube.com/watch","title":"Some video"}],"expect":{"alarm":{"grace":670}}},
{"name":"tab_flipping_inside_grace_keeps_deadline","until":901,"events":["P",{"t":600,"tab":2,"url":"https://reddit.com"},{"t":650,"tab":3,"url":"https://youtube.com"},{"t":700,"tab":4,"url":"https://x.com"},{"t":760,"tab":2}],
 "expect":{"scheduleCount":{"grace":1},"alarm":{"grace":900},"nudges":[[1,900]]}},
{"name":"debounce_rapid_flip_zero_landings","events":["P",{"t":600,"tab":2,"url":"https://reddit.com"},{"t":600.5,"tab":3,"url":"https://youtube.com"},{"t":601,"tab":4,"url":"https://x.com"},{"t":601.5,"tab":5,"url":"https://instagram.com"},{"t":602,"tab":6,"url":"https://tiktok.com"},{"t":602.5,"tab":1}],
 "expect":{"scheduleCount":{"grace":0},"phase":"active","not":[{"sync":"drift"}]}},
{"name":"extend_restarts_grace_not_ignore","until":1221,"events":["P",{"t":600,"tab":2,"url":"https://reddit.com"},{"t":920,"cmd":"extend","n":300}],
 "expect":{"nudges":[[1,900],[1,1220]],"day.ignored":0,"has":[{"cancel_alarm":"escalate"},{"sync":"response","response":"extend"}]}},
{"name":"hourly_cap_suppresses_4th","until":461,"cfg":{"GRACE_DEFAULT_S":60,"L1_MIN_GAP_S":0},
 "events":["P",{"t":100,"tab":2,"url":"https://reddit.com"},{"t":170,"cmd":"back"},{"t":171,"tab":1},{"t":200,"tab":2},{"t":270,"cmd":"back"},{"t":271,"tab":1},{"t":300,"tab":2},{"t":370,"cmd":"back"},{"t":371,"tab":1},{"t":400,"tab":2}],
 "expect":{"nudges":[[1,160],[1,260],[1,360]],"phase":"active","has":[{"focus_tab":1},{"sync":"intervention","suppressed":"hourly_cap","t":460}]}},
{"name":"l1_min_gap_10min","until":801,"events":["P",{"t":100,"tab":2,"url":"https://reddit.com"},{"t":410,"cmd":"back"},{"t":411,"tab":1},{"t":500,"tab":2}],
 "expect":{"nudges":[[1,400]],"has":[{"sync":"intervention","suppressed":"min_gap","t":800}]}},
{"name":"break_then_resume_emits_recovery","events":["P",{"t":11,"tab_group":[1,7]},{"t":600,"cmd":"break","note":"check 375px breakpoint"},{"t":900,"tab":2,"url":"https://reddit.com"},{"t":2000,"group_removed":7},{"t":4200,"cmd":"resume"}],
 "expect":{"phase":"active","has":[{"persist_resume":true},{"show_recovery":"welcome_back","note":"check 375px breakpoint"},{"reopen_group":true}],"not":[{"show_nudge":"*","before":4200}]}},
{"name":"sensitive_tab_invisible","events":["P",{"t":600,"tab":3,"url":"https://online.chase.com/acct","title":"Account 1234567 – Chase"},{"t":620,"tab":4,"url":"https://reddit.com","incognito":true},{"t":900,"tab":1}],
 "expect":{"absentStrings":["chase","1234567","reddit"],"scheduleCount":{"grace":0},"ctx.resources":["figma.com"],"momentumS":590}},
{"name":"sleep_stale_alarm_no_nudge","until":4301,"events":["P",{"t":600,"tab":2,"url":"https://reddit.com"},{"t":700,"sleep_until":4300}],
 "expect":{"nudges":[],"has":[{"log":"sleep_gap"}],"alarm":{"grace":4600},"momentumS":0}},
{"name":"two_hours_on_youtube_is_not_momentum","events":["P",{"t":20,"tab":2,"url":"https://youtube.com/watch","title":"lofi beats"},{"t":7220,"tab":1},{"t":7280,"tab":3,"url":"https://reddit.com"}],
 "expect":{"nudges":[[1,380],[2,680]],"alarm":{"grace":7580},"day.ignored":1,"has":[{"sync":"recovery","trigger":"intervention"}]}},
{"name":"related_adds_rule_and_stops_future_nudges","events":["P",{"t":600,"tab":2,"url":"https://youtube.com/watch","title":"React hooks tutorial"},{"t":700,"cmd":"related"},{"t":800,"tab":1},{"t":900,"tab":3,"url":"https://youtube.com/watch","title":"useEffect deep dive"},{"t":1000,"cmd":"end"},{"t":1010,"tab":1},{"t":1020,"cmd":"confirm"},{"t":1100,"tab":3}],
 "expect":{"nudges":[],"has":[{"group_tab":2},{"sync":"rule","host":"youtube.com"},{"cancel_alarm":"grace","t":700}],"scheduleAt":{"grace":[960,1460]}}},
{"name":"soft_confirm_after_90s_never_reprompts","until":95,"events":[{"t":0,"tab":1,"url":"https://github.com/a/b","title":"FocusGuard/engine · GitHub"},{"t":50,"tab":2,"url":"https://figma.com"},{"t":60,"tab":1}],
 "expect":{"phase":"active","ctx.confidence":"inferred","count":{"propose_context":1,"group_tab":0}}},
{"name":"cancel_suppresses_same_pattern","events":[{"t":0,"tab":1,"url":"https://github.com/a/b","title":"FocusGuard/engine"},{"t":10,"cmd":"cancel"},{"t":20,"tab":2,"url":"https://figma.com"},{"t":30,"cmd":"cancel"},{"t":40,"tab":1}],
 "expect":{"phase":"idle","count":{"propose_context":2}}},
{"name":"quiet_hours_suppress","until":901,"cfg":{"tz":"Asia/Kathmandu","quietHours":[{"from":"22:00","to":"07:00"}],"t0":"2026-10-10T22:30:00+05:45"},
 "events":["P",{"t":600,"tab":2,"url":"https://reddit.com"}],"expect":{"nudges":[],"phase":"active","has":[{"sync":"intervention","suppressed":"quiet_hours"}]}},
{"name":"pause_cancels_timers_no_guilt","until":2451,"events":["P",{"t":600,"tab":2,"url":"https://reddit.com"},{"t":650,"cmd":"pause","until":2450},{"t":1000,"tab":3,"url":"https://x.com"}],
 "expect":{"nudges":[],"has":[{"cancel_alarm":"grace","t":650}],"not":[{"show_recovery":"*"}],"alarm":{"grace":2750}}},
{"name":"idle_resets_momentum_no_overlay","events":["P",{"t":1210,"idle":"idle"},{"t":3000,"idle":"active"},{"t":3010,"tab":2,"url":"https://reddit.com"}],
 "expect":{"alarm":{"grace":3310},"not":[{"show_nudge":"*"},{"show_recovery":"*"}]}},
{"name":"sw_restart_rehydrates_and_dup_alarm_is_noop","events":["P",{"t":600,"tab":2,"url":"https://reddit.com"},{"t":700,"restart":true},{"t":901,"dup_alarm":{"kind":"grace","dueAt":900}}],
 "expect":{"has":[{"schedule_alarm":"grace","at":900,"t":700}],"nudges":[[1,900]]}}
]
```

Notes on the traces:
- Trace 7 depends on the extend expiry being exempt from `L1_MIN_GAP_S` (open question 4).
- In trace 12 the grace at 4600 is a fresh grace from wake, not the stale one.
- In trace 13, without the in-context rule the grace would be 120 (0.4); the expected 300 proves the two hours didn't count.
- Trace 19 expects 3310; without the reset it would be 3220, because 20 minutes of momentum gives 0.7.
- §18 #14 (midnight rollover) is a good 21st trace.

## 7. Open questions for the maintainer

1. **Authority.** Should the extension be authoritative per browser profile, with the server as a mirror and command relay for mobile v1.1? *Recommendation: yes.* Log it as D-8 and amend P9, §5, §8.2 and §17. Two desktops then have independent contexts, which §18 #15 already implies.
2. **Momentum after a self-return.** Freeze it or reset it? *Recommendation: freeze.* Reset only on L1, break, idle, sleep, pause and end. With a reset, a 1-minute Reddit glance would hand a deep-focus user a full 5-minute grace on the next drift, which is the opposite of D-3.
3. **Sensitive before user rules,** which deviates from the §9.2 order. *Recommendation: yes.* User rules can only add exclusions.
4. **Extend expiry vs `L1_MIN_GAP_S`.** *Recommendation:* exempt the reminder after an extend from the 10-minute gap, because the user asked for it, but count it toward the hourly cap.
5. **What a drift sends to the server.** *Recommendation:* tier and timings only, never the destination host. Unknown hosts are trusted and never sent to an AI in v1 (dropping §9.2 "AI once"). Revisit with on-device Gemini Nano.
6. **Back-to-back contexts (§18 #2).** Green tiers auto-join, so a new context is never proposed automatically. *Recommendation:* v1 gets a "New context" button (end, then propose on the current tab). The heuristic version waits for real usage data.
