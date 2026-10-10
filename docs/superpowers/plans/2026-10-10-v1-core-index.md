# FocusGuard v1 Core — Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each stream plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 core: a pure drift engine + extension shell, Supabase-authenticated FastAPI backend, and Expo web dashboard, per the approved spec.

**Architecture:** The Chrome extension does the work (pure `step()` engine driven by `chrome.alarms`, nudges, tab groups, optional AI); the backend only stores goals, context snapshots (site *names*), settings and absolute daily totals; the dashboard reads/writes those over REST. Five streams with disjoint file ownership run in parallel against the contracts below.

**Tech Stack:** Chrome MV3 (ES-module service worker, no bundler, JSDoc + `// @ts-check`, `node --test`); FastAPI + SQLAlchemy 2 + Alembic + PyJWT[crypto] + Postgres/SQLite; Expo SDK 57 (expo-router, web export) + `@supabase/supabase-js`; Supabase Auth.

**Spec:** `docs/specs/2026-10-10-v1-core-design.md` (+ its normative appendices in `docs/research/`).

## Stream plans

| Stream | Plan | Owns (only these paths) |
|---|---|---|
| A · Engine | `2026-10-10-v1-A-engine.md` | `extension/engine/**`, `extension/package.json`, `extension/jsconfig.json` |
| B · Backend | `2026-10-10-v1-B-backend.md` | `backend/**` |
| C · Dashboard | `2026-10-10-v1-C-dashboard.md` | `src/**`, root `package.json`, `package-lock.json`, `app.json`, root `.env.example` |
| D · Extension shell | `2026-10-10-v1-D-shell.md` | `extension/background.js`, `extension/shell/**`, `extension/nudge/**`, `extension/copy/**`, `extension/manifest.json`, `extension/config.js`, `extension/config.local.example.json`, `extension/privacy.js`, `extension/content.js` (delete) |
| E · Popup, onboarding, auth, AI, Beast | `2026-10-10-v1-E-popup.md` | `extension/popup/**`, `extension/onboarding/**`, `extension/auth/**`, `extension/ai/**`, `extension/beast/**`, `extension/blocked.html` |

Lead (not a stream) owns: `docs/**`, `README.md`, `.gitignore`, root `.github/**`, git operations, final integration.

## Global Constraints

- Executors **never run git** (parallel agents share one working tree); the lead commits per stream after verification. Replace every plan "Commit" step with "Report to lead: files changed + test output".
- Edit only the paths your stream owns. Need a change elsewhere → write it in your report.
- Page titles, full URLs, raw events, resume targets and AI keys **never leave the browser** (spec §1.3, D-15). Server payloads contain hostnames only.
- Extension: `minimum_chrome_version` `"120"`; ES modules; **no npm runtime dependencies, no remote code, no bundler**; `// @ts-check` at the top of every extension JS file; tests with `node --test`.
- Engine is pure: no `chrome.*`, no `Date.now()`, no `fetch`, no `Math.random()` inside `extension/engine/`.
- Time: epoch **milliseconds** everywhere in JS; config constants named `*_S` are **seconds**; API dates are ISO-8601 UTC strings; `day` is `YYYY-MM-DD` in the **user's local tz**.
- Grace: default 300 s, min 60, max 900; momentum factors 1.0 / 0.7 / 0.4 at <20 / 20–45 / >45 in-context minutes; high-momentum floor 120 s never exceeding base; risk yellow ×1.2, red ×1.0 (D-3).
- Caps: ≤3 nudges per rolling hour (≤1 after 3 ignored that day); ≥600 s between L1s except the reminder after an extend; quiet hours and pause suppress (not queue).
- Copy: SPEC §10.3 voice; banned words `lazy, failed, wasted, distracted again, you should have, disappointing` never appear in any string shown to users.
- Backend: Python 3.10, every query scoped by the token's `sub`; unknown/other-user ids → 404.
- Expo: read https://docs.expo.dev/versions/v57.0.0/ before touching Expo APIs (AGENTS.md).
- Accessibility: every interactive control has an accessible name/role; touch targets ≥44 px in the dashboard and nudge card.

## Shared contracts (all streams code against these exactly)

### C1 · REST API (B implements; C, D, E consume). Base `${API_URL}/api`. Auth header `Authorization: Bearer <supabase access_token>` on all but `/health`.

```ts
type Settings = { grace_s?: number /*120..900*/, quiet_hours?: {from:"HH:MM", to:"HH:MM"}[] /*≤3*/ };
type Profile  = { user_id: string, tz: string, settings: Settings };
type Goal     = { id: string, day: string, title: string, category: "work"|"learning"|"personal", status: "open"|"done", sort: number, created_at: string, done_at: string|null };
type ContextSnap = { id: string, device_id: string, title: string, mode: "work"|"learning"|"personal",
                     state: "detected"|"active"|"grace"|"intervened_l1"|"escalated_l2"|"on_break"|"ended",
                     confidence: "inferred"|"confirmed", started_at: string, ended_at: string|null,
                     last_active_at: string, sites: string[] /*hostnames, ≤50*/ };
type DailyTotals = { day: string, device_id?: string, focus_s: number, nudges: number, self_returns: number,
                     recoveries: number, snoozes: number, breaks: number, longest_detour_s: number };
```
| Call | Request | Response |
|---|---|---|
| `GET /health` | – | `{status:"ok"}` |
| `GET /me` | – | `Profile` |
| `PATCH /me` | `{tz?, settings?}` | `Profile` |
| `GET /me/export` | – | `{profile, goals: Goal[], contexts: ContextSnap[], daily: DailyTotals[]}` |
| `DELETE /me` | – | `204` |
| `GET /goals?day=` | – | `Goal[]` sorted by `sort, created_at` |
| `POST /goals` | `{title, category?, day?}` **or** `{lines, category?, day?}` | `Goal[]` (created) — `201` |
| `PATCH /goals/{id}` | `{title?, status?, sort?, category?}` | `Goal` |
| `DELETE /goals/{id}` | – | `204` |
| `PUT /contexts/{id}` | `ContextSnap` minus nothing (body `id` must equal path) | `ContextSnap` |
| `GET /contexts?day=` / `?active=1` | – | `ContextSnap[]` (active: 0 or 1 item, latest non-ended by `last_active_at`) |
| `PUT /daily/{day}` | `DailyTotals` with `device_id` required | `DailyTotals` |
| `GET /daily?from=&to=` | ≤31 days | `DailyTotals[]` summed across devices (no `device_id`), `longest_detour_s` = max |

Errors: `401 {detail}` bad/expired token · `404` · `422` FastAPI validation.

### C2 · Engine module (A implements; D consumes)

```js
// extension/engine/step.js
export const DEFAULTS;                                   // frozen config, engine notes §2.1
export function initialState(now /*ms*/) /*: EngineState*/;
export function step(prev, input, now, cfg) /*: {state, effects}*/;   // engine notes §2.2–2.5 + spec §4.4
export function alarmsFor(state) /*: Record<kind, atMs>*/;
export function view(state, now) /*: PopupView*/;
// extension/engine/tiers.js
export function matchHost(host, seed) /*: {domain, label, tier, mode, title}|null*/;  // longest-suffix
export function tierOf(host, ctx, seed, hints) /*: 'green'|'yellow'|'red'|'unknown'*/;
// extension/engine/domains.json  — format in engine notes §3
```
Input and Effect unions: exactly engine notes §2.3, plus spec §4.4: `{type:'cmd', cmd:'new_task', title?}` and `{type:'tier_hint', host, tier, related}`.

```js
/** PopupView */ { phase, context: {id,title,mode,confidence,startedAt,inContextMin}|null,
  drift: {deadline, tier}|null, pausedUntil: number|null, onBreak: {startedAt, note}|null,
  proposal: {host, title, suggested:{title,mode}}|null }
```

### C3 · Runtime messages (D implements in `background.js`; E sends)
`chrome.runtime.sendMessage(msg)` → `Promise<response>`:
| `msg` | Response |
|---|---|
| `{type:'cmd', cmd, ...args}` (any engine `cmd`) | `{ok:true, view: PopupView}` |
| `{type:'get_view'}` | `{view: PopupView, signedIn: boolean, deviceId: string}` |
| `{type:'settings_changed'}` | `{ok:true}` (D re-reads settings cache + AI option) |
| `{type:'nudge_action', interventionId, action, n?, title?}` (from the injected card) | `{ok:true}` |

### C4 · Extension modules crossing D/E
```js
// extension/auth/session.js  (E)
export async function getAccessToken() /*: string|null — refreshes if <60s left*/;
export async function signOut();
export async function isSignedIn() /*: boolean*/;
// extension/ai/index.js  (E)
export async function classify({host, title, contextTitle}) /*: {tier, related}|null*/;
export async function nameContext({host, title, goals}) /*: {title, mode}|null*/;
// extension/shell/settings.js  (D)
export async function getSettings() /*: {grace_s, quiet_hours, aiMode, beastUntil, relatedRules, extraSensitive}*/;
// extension/config.js  (D) — ESM
export const CONFIG /*: {API_URL, SUPABASE_URL, SUPABASE_ANON_KEY, DASHBOARD_URL}*/;  // merged with config.local.json if present
```
Storage keys (`chrome.storage.local` unless noted): `fg_engine` (**session**), `fg_device_id`, `fg_auth`, `fg_settings_cache`, `fg_ai` (`{mode, baseUrl?, apiKey?, provider?, model?}`), `fg_resume:<ctxId>`, `fg_accum:<day>`, `fg_tier_cache`, `fg_rules`, `fg_extra_sensitive`, `fg_beast`, `fg_seen_explainer`, `fg_consent` (`{at, version}`).

## Contract resolutions (lead, after stream plans — these override anything above)

R1. **Test commands:** Node 24 does not accept a bare directory. Use globs: `node --test "extension/engine/**/*.test.js"`, `node --test "extension/{auth,ai,beast,popup}/**/*.test.js"`, `node --test "extension/shell/**/*.test.js" "extension/nudge/**/*.test.js" "extension/copy/**/*.test.js"`, `npm test` (dashboard, `src/**/*.test.mjs`).
R2. **Grace:** the *user setting* `settings.grace_s` is 120..900 (C1, UI chips 120/300/600). The *engine's computed* grace clamps to 60..900 (momentum/risk). Both true; no conflict.
R3. **`POST /goals {lines}`:** split on newlines only; trim; drop empties; >20 lines or any title >200 chars → 422 (no silent truncation). Default `category` = `"work"`.
R4. **`PATCH /me` settings:** top-level merge; `quiet_hours: []` clears; absent keys omitted in responses (never `null`).
R5. **DailyTotals meanings:** `focus_s` = seconds in `active` with current tab in-context; `nudges` = L1+L2 shown; `self_returns` = returned to context before the grace deadline (no nudge); `recoveries` = returned after a nudge, or resumed from a break; `snoozes` = extends; `breaks` = breaks started; `longest_detour_s` = max drift duration that day.
R6. **Context freshness:** the extension PUTs the context snapshot on every state change **and at least every 10 min while a context exists**. `GET /contexts?active=1` returns `[]` if the latest non-ended context's `last_active_at` is older than 30 min. A PUT whose `last_active_at` is older than the stored row's returns the stored row unchanged (out-of-order replay guard).
R7. **Ids & formats:** context ids and `device_id` match `^[A-Za-z0-9_-]{1,64}$` (`crypto.randomUUID()` qualifies); datetimes are ISO-8601 with offset (`toISOString()`); `PUT /daily/{day}` body `day` must equal the path; context `(user_id, id)` is the key.
R8. **Unknown request fields → 422** on every endpoint (privacy guarantee). Clients send exactly the C1 fields.
R9. **Extra status codes every client handles:** `429` (rate limit, `Retry-After: 60` → back off, don't sign out), `503` (auth keys unreachable → retry later, don't sign out), `502` from `DELETE /me` (data deleted, auth-user deletion failed → retry; second call returns 204).
R10. **`GET /daily`:** days with no rows are omitted (not zero-filled); clients fill gaps.
R11. **CONFIG is synchronous:** `extension/config.js` exports `CONFIG` built from checked-in defaults; module service workers reject `import()`/top-level `await`, so `config.local.json` is loaded by the shell at startup into `fg_config_override` (storage.local) and merged by a `getConfig()` helper; modules needing overrides at runtime call `getConfig()`. `DASHBOARD_URL` has no trailing slash.
R12. **Manifest additions from E:** `"identity"` permission; `action.default_popup: "popup/popup.html"`; `onboarding/onboarding.html` opened on install; no `"offscreen"` until on-device AI is verified to need it.
R13. **Beast alarms:** D's `onAlarm` forwards any alarm whose name starts with `beast:` to `onBeastAlarm(name)` from `extension/beast/beast.js`. Beast owns DNR rule ids 9000–9049 (dynamic) and ≥9500 (session).
R14. **Storage shapes:** `fg_beast` = `{sites: string[], until: number, startedAt: number}` (so `beastUntil = fg_beast?.until`); `fg_rules` = `{host: string, contextId: string, contextTitle: string}[]` (written by D on `related`; popup deletes → sends `{type:'settings_changed'}` and D removes the host from the live ctx via a `{type:'cmd', cmd:'unrelate', host}` engine input — **stream A adds `unrelate`**: removes host from `ctx.relatedHosts`, then `reland`); `fg_extra_sensitive` = `string[]`; `fg_signin_email` (storage.session, E-private).
R15. **Consent gate:** D observes nothing until `fg_consent` exists; re-checks on `settings_changed`. `get_view` answers while signed out and before consent (`view.phase = 'idle'`).
R16. **AI payload (amends D-14):** `classify` sends host + sanitized title + context title; `nameContext` additionally sends the user's own goal titles for today. Disclosed in settings and onboarding. Nothing else.
R17. **Pause/new context from popup:** Pause shown only when a context exists; un-pause = `cmd:'resume'`; New context = `cmd:'end'` then detection proposes on the current tab.
R18. **Welcome-back site names:** popup reads up to 3 hostnames from `fg_resume:<ctxId>` (PopupView unchanged).
R19. **C3 `nudge_action`** = `{type:'nudge_action', interventionId, action:'back'|'related'|'new_task'|'extend'|'break'|'dismiss', n?, title?, note?}`. The card renders the fixed spec §4.3 action set; `show_nudge.actions` is advisory.
R20. **Host normalization is A's:** `extension/engine/tiers.js` exports `normalizeHost(rawHostname) → string` (lowercase, strip port, strip leading `www.`). D's `tabToInput` calls it; A's test harness calls the same function; every `host` in engine state/effects/records is normalized. `matchHost` returns the matched seed `domain` (longest suffix).
R21. **Engine cfg** (built by D's `buildCfg`): `{...DEFAULTS, GRACE_DEFAULT_S: settings.grace_s ?? 300, tz, quietHours: settings.quiet_hours ?? [], beastUntil: fg_beast?.until ?? null, tables: {seed: <domains.json parsed>, cache: <fg_tier_cache>}}`. D loads `domains.json` via `fetch(chrome.runtime.getURL('engine/domains.json'))` (Chrome 120 has no JSON import).
R22. **Heartbeat:** D owns the periodic `heartbeat` alarm (60 s while a context exists). `alarmsFor(state)` returns only `grace`, `escalate`, `soft_confirm`, `pause_end`. D names alarms `${kind}@${atMs}` and passes `dueAt = atMs` back in the `alarm` input.
R23. **`tab_group` input:** tab grouped/ungrouped → `{type:'tab_group', tabId, groupId}` with `groupId === -1` meaning "not in a group" (also sent when a grouped tab closes); group closed → `{type:'tab_group', tabId:null, groupId, removed:true}`. A must handle both.
R24. **Sync record shapes** (A emits exactly; D's accumulator consumes):
  `{kind:'intervention', id, at, level:1|2, suppressed?: 'hourly_cap'|'min_gap'|'quiet_hours'}` → `nudges++` unless suppressed ·
  `{kind:'response', id, at, response:'back'|'extend'|'related'|'dismiss'|'break'|'new_task'}` → `snoozes++` on extend ·
  `{kind:'recovery', id, at, trigger:'self_returned'|'intervention'|'break_ended', awayS}` → self_returned → `self_returns++`, else `recoveries++`; `longest_detour_s = max(awayS)` ·
  `{kind:'break', id, at}` → `breaks++` · `{kind:'drift', id, at, tier}` · `{kind:'rule', id, at, host, contextId}` · `{kind:'session_end', id, at, contextId}`.
  `id` is deterministic (from `now` + `rev`) so replays dedupe. The **context snapshot** and **`focus_s`** are derived by D from engine state after each step (focus accrues for elapsed time while the previous state was `active` with `current.inCtx`), not from records.
R25. **`getSettings()`** (C4) also returns `tz` (from cached Profile; fallback `Intl` tz).
R26. **`fg_rules`** entries = `{host, contextId, contextTitle, at}` (supersedes R14's shape).
R27. **Context naming via AI:** the popup (E) calls `nameContext` when a proposal is visible and pre-fills the editable title; D's notification proposal uses the rule-based name. No engine input for renaming a pending proposal.
R28. **CONFIG:** R11 wins — no `configReady`. D implements `getConfig()` (async, merges `fg_config_override`) alongside synchronous `CONFIG`; dev engine overrides live in `fg_config_override.ENGINE`.
R29. **Extra keys:** `fg_nudge` (storage.session, D-private: tab showing the card). `cmd` messages accepted only from extension pages (`sender.id === chrome.runtime.id` and no `sender.tab` unless it is the nudge card's `nudge_action`). E sends `settings_changed` after sign-in, sign-out and any settings change.
R31. **Build order dependency:** D Task 1 (ESM `privacy.js` exporting `sanitizeTitle`, `isSensitiveHost`) runs **before** A Task 3. The CommonJS self-check moves to `extension/shell/test/privacy.test.js`.
R32. **`focus_s` comes from the engine** (supersedes R24's "derived by D"): A emits `{kind:'focus', id, at, day, seconds}` deltas; **every** sync record carries `day` (local `YYYY-MM-DD` per `cfg.tz`); D's accumulator keys by `rec.day`. The context snapshot is still derived by D from `state.ctx` + `state.phase`.
R33. **Engine state lives in `chrome.storage.local`** under `fg_engine` (supersedes C4's "session"), so an active context survives a browser restart; the startup heartbeat + sleep-gap logic drop any stale drift. `fg_nudge` and `fg_signin_email` stay in `storage.session`.
R34. **Related rules are per-context only** (`ctx.relatedHosts`; trace 14). `getSettings().relatedRules` is the popup's list of `fg_rules` for display/delete, not engine cfg.
R35. **`PopupView.context.inContextMin`** = whole minutes since `ctx.startedAt` (shown to users; never a streak that resets on a nudge). Momentum stays internal.
R36. **Dwell + copy keys:** D sends `{type:'heartbeat', reason:'dwell'}` ~`DWELL_MIN_S`+0.5 s after a landing (a `setTimeout` is fine: the SW stays alive 30 s). Copy keys the engine emits: `nudge_l1`, `nudge_l2`, `welcome_back`. Card buttons send cmd ids `${interventionId}:${action}` so double clicks dedupe. Proposal titles come from the seed label, the user, or AI — never the raw page title (it is uploaded).
R37. **Type-checking:** `extension/jsconfig.json` (A) includes `**/*.js` under `extension/` (excluding `**/*.test.js` is not needed) and `"types": ["chrome"]`; `@types/chrome` comes from root devDependencies (C, per R30).
R38. Review Focus #1's restart trace is **20** (21 is midnight rollover).
R39. **Name & distribution (D-17, D-18):** user-visible product name is **"FocusGuard AI"** (manifest `name`, popup, onboarding, card, dashboard title, emails). Distribution is GitHub Releases (Load unpacked), so `extension/manifest.json` (D) carries a fixed public `"key"` (generated once by the lead; the private half is never committed) to pin the extension ID; `EXTENSION_ID` env/CORS and the Supabase redirect `https://<EXTENSION_ID>.chromiumapp.org/**` use that ID. Store-only items (listing, store review) are out of scope; consent page and `/privacy` remain.
     Fixed values (public, safe to commit): extension ID **`jkkgdjhaoomnjkblodmmjoikglknmifi`**; manifest `"key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArc4SzN6+lHoUOsIX8HiBRGfPa80oyWcIM5+VOqkNy3nma4Hpl0AHsvRzV6mpClHXRLrN8IRtSSDSkmpOTxJVmnuCv/036QNy3lzsEKYqhM4BQtiZbWimyHk3pSLm5e89Zpm3HYvMmyClJUGrrhIVVSyagF+TypWq/xjvmrQci7yoL/RLTtMTaPzgsl9G8NphtgfcMHMNHSpXTeXHyEGCZGo4+Phs6L1bT0xL2HpamaSmB/pOG3EpoHWudf4nTj2dIbu0Jbe1xBHKN87HldsRmaQDEO1i7pB6xzm2tpz7zFO24r+wom/mNddT6US1gPG5o61RpQaoEHWZczDHtZKCawIDAQAB"`. The private key is at `~/.focusguard/extension-key.pem` on the maintainer's machine only.
R40. **Sign-in order (D-22):** in the popup (E) and the dashboard sign-in screen (C), **"Continue with Google" is the primary, first button**; "Email me a code" is the secondary option below it. Email codes are delivered by Supabase via Gmail SMTP (no code impact; README/runbook only).
R41. **R24 amended (after plan review):** `intervention.suppressed` may also be `'beast'` or `'not_drifting'` (not counted as nudges). Additional record kinds `context`, `resource`, `focus` (R32) exist; the accumulator ignores kinds it doesn't count. Records use `contextId` (never `ctxId`). Break-resume recovery has `trigger:'break_ended', awayS:0` (excluded from `longest_detour_s`). `unrelate` is sent **without** an `id`. Engine `startup` heartbeat is sent only from `runtime.onStartup` (not `onInstalled` updates).
R42. **`minimum_chrome_version` = "127"** (raised from 120 after build): `chrome.action.openPopup()` — used by the notification click and `show_progress` — needs Chrome 127.
R30. **Types:** stream C adds `@types/chrome` to root devDependencies so `tsc -p extension/jsconfig.json` type-checks `// @ts-check` files. Dashboard settings route is `${DASHBOARD_URL}/settings`.

## Review Focus (cross-stream; each line has a test in the owning stream)

1. **Laptop sleeps mid-grace / browser restarts** → no nudge fires on wake; grace restarts fresh. *(A: traces 12, 21 · D: startup heartbeat test)*
2. **User has never granted host access or is on a page where injection fails (chrome://, Web Store, PDF)** → notification fallback, never a crash or silent loss. *(D: executor fallback test)*
3. **Token expires while offline for a day** → totals accumulate locally and upload after re-auth; nothing double-counts. *(D: accumulator idempotency test · B: PUT /daily idempotency test)*
4. **User in UTC+5:45 just after midnight / before 05:45** → "today" goals and totals land on the local day. *(B: tz test · A: rollover trace 21)*
5. **Another user's id in a URL** → 404 with no data, on every endpoint. *(B: two-user isolation test)*

## Execution order
All five streams start in parallel. Integration (lead): D imports A's real engine (D tests against a stub until A lands), E against D's messages, C against B's API (C uses fetch mocks in tests). Final: manual end-to-end checklist in stream D's last task.
