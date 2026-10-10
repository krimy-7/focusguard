# FocusGuard — Status Audit

**Date:** 2026-10-10 · **Scope:** whole repo (backend, extension, Expo app, Android module, docs) · **Method:** every source file read; key claims re-verified by hand.

> **Phases 1–4 in progress (2026-10-10):** designed in `docs/specs/2026-10-10-v1-core-design.md`, planned in `docs/superpowers/plans/` (index + streams A–E). Launch blockers needing the maintainer: `docs/PENDING_DECISIONS.md`.
>
> **Phase 0 (cleanup) done on branch `phase-0-cleanup`.** Findings below describe the repo *before* that branch; items fixed there: secrets blanked, debug/CORS/dev-reset locked down, `/ws` + tasks + milestones + dead endpoints removed, demo data behind `DEMO_MODE`/`EXPO_PUBLIC_DEMO_MODE`, honest offline states, grace = 5 min, title sanitizing + sensitive-domain + incognito skip, OpenRouter call removed from the extension, blur spam + popup reset/PRO removed, Extend fixed, Android blocker archived to `archive/android-blocker`, dead template files/deps removed, first backend tests. Still open: everything in Phases 1–5.

---

## 0. Decisions already made (Krishna, 2026-10-10)

| # | Decision |
|---|---|
| D-1 | **Goal: real users soon.** Store compliance, accounts and privacy come before new features. |
| D-2 | **v1 = extension-first.** Chrome extension + small web dashboard (Expo web build) + backend. Mobile app moves to v1.1. |
| D-3 | **Momentum rule:** a long, unbroken stretch on one task makes grace **shorter** if the user drifts (catch it before momentum is lost). Deep focus never earns *extra* grace. README 1 §9.4 `momentum_factor > 45 → 1.25` is **wrong**; Readme 2 "Hyperfocus Protection" is right. |
| D-4 | **Snooze-adaptive grace — open.** Recommendation in §7. |

---

## 1. Verdict

FocusGuard is a strong idea with a well-thought-out spec (README 1) sitting on top of a 2-day hackathon demo. The demo *looks* like the product, but most of the core loop is either missing, simulated, or tuned for stage (10-second grace). Nothing is wasted — the domain taxonomy, context detect/confirm/group flow, break/resume and the UI kit are reusable — but **the core engine has to be built, not polished.**

Rough reality check against the spec:

| Spec area | Reality |
|---|---|
| Context detection / confirm / grouping | 🟡 Works (keyword taxonomy + optional LLM). No soft-confirm, no mode in prompt. |
| State machine / pure `step()` engine | 🔴 Does not exist anywhere. Logic is ad-hoc in `extension/background.js` (`distractionState` = none/grace/first/second). |
| Green/Yellow/Red/Sensitive tiers, debounce, velocity | 🔴 Missing. |
| Grace period | 🔴 Hardcoded to **10 seconds** (`extension/config.js:21-23`). Timers run in a *content script* `setTimeout`, so they die if the tab navigates/closes. |
| L1/L2 interventions | 🟡 Exist, but as a **full-screen blurred overlay** (`content.js:96-99`) that auto-dismisses after 5s. "Extend" is broken. No caps. |
| Recovery / welcome back | 🟡 Break → resume restores context title + "Continue where you left off" (hardcoded). No completed/next/resources, no tab restore. |
| Privacy (sanitize, sensitive filter, incognito, purge, export/delete) | 🔴 None implemented. |
| Auth / multi-user | 🔴 No User table, no `user_id` anywhere. Single-tenant. |
| Cross-device sync | 🔴 `/ws` is an echo stub nobody connects to. "Sync" = both clients hitting the same DB. |
| Beast Mode | 🟡 Desktop: redirect-after-load (bypassable). Android: UsageStats blocker that likely silently fails on Android 10+. |
| AI layer | 🟡 5 providers + mock. Prompt bug (coach prompt sent with JSON prompts), no tone guard, falls back to Ollama not mock. |
| Tests | 🔴 Zero. |

---

## 2. 🔴 Blockers — fix before anything else

1. **Leaked API keys.** `backend/.env.example` is tracked in git since the first commit (`86b98ad`) and contains two OpenRouter keys (`OPENAI_API_KEY_FIRST/SECOND`) and the Postgres password. Repo is private, but every org member/judge has them. → **Revoke both keys at openrouter.ai now**, replace the file with blanks, `git rm --cached` anything secret, consider `git filter-repo` to scrub history. `.gitignore` listing it does nothing because it was already tracked.
2. **Wide-open backend.** `DEBUG` defaults to `True` (`backend/app/config.py:11`) → CORS reflects *any* origin with credentials (`main.py:43`) **and** enables `POST /api/dev/reset`, which truncates every table. `start.bat` binds `0.0.0.0` and opens an **ngrok tunnel** → anyone with the URL can wipe the DB. The extension popup's "Reset local data" button actually calls this (`popup.js:330`).
3. **No accounts.** Every query is global. Two real users = one shared brain.
4. **Fake data shown as real.**
   - `src/lib/api.ts:161` — every API call silently falls back to `MOCK.*` on error. Backend down ⇒ user sees a 14-day streak, score 82, an active "Landing Page Design" context with a pulsing "Watching" dot, and a fake nudge. Writes (`logMood`, `updateGoal`, `startBreak`…) *appear* to succeed and are lost.
   - `backend/app/services/mock.py` seeds fake sessions/achievements on first boot ⇒ fresh install shows a 6-day streak.
   - Mock transcription returns a canned sentence that gets **saved as the user's real goals**.
5. **Privacy promises with nothing behind them.** Full unsanitized tab titles (email subjects, doc names, search queries) are sent to the backend and on to LLMs; no sensitive-domain filter; incognito is monitored; the extension calls OpenRouter **directly** with keys loaded into the extension; Settings has a "Private mode — never send raw activity" toggle that is local `useState` only.
6. **Interventions violate your own P5** ("escalate in tone, not force"): a full-viewport blur at max z-index is a soft block.

---

## 3. The docs disagree with each other

| Source | Says the product is | Notes |
|---|---|---|
| Proposal PDF | VS Code extension + CLI + Electron dashboard, **local-first encrypted SQLite**, optional cloud | Nothing of this was built. |
| README 1 | Chrome extension + mobile companion + server-authoritative engine; explicitly "**not local-only**" | Best document. Treat as the spec, with D-3 applied. |
| Readme 2 | Same idea, different state machine (`watching/paused/…`), different API (`/api/v1/...`), momentum rule = D-3 | Two LLM drafts concatenated; contains chat preamble. |
| README.md | The actual runbook | Accurate to code. Keep. |

**Recommendation:** keep `README.md` (runbook) + `README 1.md` renamed to `docs/SPEC.md` with D-3 patched in; delete `Readme 2.md` after copying its momentum section; keep the PDF as history. One spec, one runbook.

Also note the privacy story flipped: proposal = local-first, README 1 = cloud-with-short-retention. See §6 Q-1 — extension-first makes local-first realistic again, which is a better story for store review *and* for users.

---

## 4. Per-surface findings (highlights — full detail in the agent reports)

### Backend (`backend/app`)
- `services/context_engine.py` (~110-domain taxonomy, title cleaning, Jaccard matching to existing contexts) is the best code in the repo. **Keep.**
- Dead: `/ws` + `ConnectionManager`, `tasks` router + `Task` model, `Milestone` model, `GET /events`, `GET /mood`, `GET /contexts/{id}`, `DELETE /planning/goals/{id}`.
- `/api/sync` silently drops `context_recovery` events (`sync.py:16`) — the one metric that proves the product works is lost.
- `GET /achievements` writes to the DB. Achievements are mostly fake: `first_recovery` seeded, `beast_mode` can never unlock, `seven_day_streak` counts sessions not days.
- AI: sync `httpx` in request handlers (7s blocking), Gemini key in URL query string, `_effective_provider` falls to Ollama (always "ok") instead of mock, so every call first hits `localhost:11434`.
- `utcnow` everywhere; "today" is UTC ⇒ Nepal/India users' days start at 05:45/05:30.
- Committed junk: `reset_probe.db`, six `v*.log` files (from another machine's `E:\`).

### Extension (`extension/`)
- Timers in content script (§1). `state` held in memory, listeners don't `await loadState()` ⇒ SW restart can overwrite stored context. `focusguard.sync` alarm has no listener.
- `content.js` posts an "interruption" event on **every `window.blur`** from every tab ⇒ interruption counts are inflated garbage.
- Background-tab `onUpdated`/`onCreated` treated as the active tab; closing *any* tab flushes the session.
- `domainTopic` regexes: `x\.com` matches `dropbox.com`; `domain-groups.json` is unused.
- `host_permissions: <all_urls>` + `web_accessible_resources: <all_urls>` (lets any site fingerprint the extension). `idle` and `declarativeNetRequest` missing though the spec needs them.
- Popup: polls every 500 ms and writes storage on each poll; countdown freezes; "Saved locally (offline)" toast is false; settings button dead; "PRO" badge.

### Expo app (`src/`)
- `tsc` and lint are clean. Design system is solid.
- Settings: every toggle is unsaved local state; Log Out has no handler; cog pushes `/settings` on top of itself.
- Support: Timer/Meditation "Pause" calls `start()`; ambient sounds are labels only; mood has no confirmation.
- "Voice note" is a file picker, not a recorder. Goals can't be edited (props exist, never passed).
- Accessibility: only one component sets an accessibility prop; many ~24px touch targets.
- ~12 dead Expo-template files, `App.tsx`/`index.ts` dead, unused deps (`@expo/ui`, `expo-device`, `expo-glass-effect`, and 4 more only used by dead files). `scripts/reset-project.js` will move/delete `src/` if someone runs `npm run reset-project`.

### Android module (`modules/focusguard-usage`)
- UsageStats foreground-service app blocker. Contradicts the spec's scope boundary. Uses `QUERY_ALL_PACKAGES` (Play-restricted, and redundant with the `<queries>` block) and `foregroundServiceType="dataSync"` (wrong type; Play will flag it). `startActivity` from a background service is blocked on Android 10+ and the exception is swallowed ⇒ **blocking very likely does nothing on modern phones**.

---

## 5. Feature verdicts

### ✂️ Cut (or archive on a branch)
| Feature | Why |
|---|---|
| Android app-blocker module | Out of spec scope, Play policy risk, probably broken. Revisit only if users ask. |
| Meditation | Labels with no audio; spec says "not competing with dedicated apps". Link to an external one if anything. |
| Pomodoro in v1 | Spec: "never the central product". It's mobile-only anyway (v1.1). |
| Focus score % | Grading UI contradicts "story, not numbers" (§13.2) and P4. Replace with the daily narrative. |
| Achievements (as built) | Fake/seeded. Rebuild later from real Recovery data, 3–4 max. |
| 5 AI providers | YAGNI. One provider + template fallback. Keep the interface so it's swappable. |
| `/ws` echo, tasks, milestones, dead endpoints, template files, unused deps, logs, `.db` | Dead weight. |
| "PRO" badge, dev reset button in popup | Misleading / dangerous. |
| Silent mock fallback + seed data | Replace with honest empty/offline states and a first-run onboarding. Keep mocks only behind an explicit `DEMO_MODE`. |

### ✅ Keep and build on
Context taxonomy + detect/confirm/group · break/resume flow · goal extraction from text · design system & components · "Recoveries" (not "interruptions") wording · Beast Mode **on desktop** (rebuild with `declarativeNetRequest`, user-initiated only).

### ➕ Add — v1 must-haves (in priority order)
1. **Accounts.** One provider that handles both a web dashboard and an extension token cleanly (magic link / Google). Add `user_id` to every table.
2. **A real engine.** Pure `step(state, input, now, cfg) → (state, effects)` with replay-trace tests (README 1 §8, §19). Timers via `chrome.alarms` + absolute deadlines in `chrome.storage`.
3. **Tiers + debounce + caps.** Green/Yellow/Red/Sensitive lookup, 4s dwell, 3 nudges/hour, 10-min min gap, momentum rule D-3.
4. **Non-blocking nudge.** Small corner card in a shadow DOM (or `chrome.notifications`) with **Back · I'm on it (this is related) · +5 min · Break**. "This is related" writes a per-context domain rule — this is the single biggest false-positive killer.
5. **Real recovery.** Make a context = a **Chrome tab group** (`chrome.tabGroups`). "Back to work" refocuses the exact tab; "Resume" after a break reopens the group. Resume target stays on-device. This is the thing no competitor does well and it *is* the core promise.
6. **"Leave a note for future you"** — one optional line when taking a break or snoozing; shown first on return. Cheap. Evidence (Leroy & Glomb 2018) shows a ready-to-resume plan reduces attention residue; benefit to the *resumed* task is plausible but less proven — so measure it. Use the user's own note as the recovery text instead of an LLM guess.
7. **Pause FocusGuard** (30 min / until tomorrow / off) and quiet hours. Users uninstall tools they can't silence.
8. **Privacy floor:** hostname + title sanitized to ≤120 chars, sensitive-domain list (+ user exclusions), skip incognito, raw-event purge job (7 days), export + delete account, a privacy policy page.
9. **Settings that persist** (grace length, quiet hours, pause, exclusions) — stored server-side per user, cached in extension.
10. **Daily narrative** from real counts, template-first (README 1 §13.2). No AI needed for v1.
11. **Privacy-preserving outcome metrics:** nudge → returned within N min, self-returns, snooze rate. Without these you can't tell if the product works or tune grace.
12. **Onboarding:** pick today's goal → see the extension confirm a context → explain the nudge once.

### ⏭ Later (v1.1+)
Mobile companion (planning by voice, inactivity check-ins, notifications) · adaptive grace (§7) · tone packs + Nepali copy · velocity check on Yellow sites · LLM copy for nudges (behind the template guard) · VS Code extension from the original proposal (fits the developer persona well) · Firefox/Edge.

---

## 6. Open questions for the team

| ID | Question | Recommendation |
|---|---|---|
| Q-1 | Where does the engine run? README 1 says server-authoritative. | **In the extension** for v1. Timers, nudges and resume all happen in the browser; latency and offline become non-issues; far less browsing data leaves the device (closer to the proposal's privacy promise and easier store review). Backend stores goals, contexts, settings, compact summaries, and relays to mobile later. |
| Q-2 | Auth provider | Pick one that does magic-link + Google and gives the extension a token via `chrome.identity` or a web login handoff. |
| Q-3 | Hyperfocus *on a distraction* (2 h on one YouTube tab, zero switches) | Momentum must be measured as time *in the context*, not "no tab switches", else this looks like deep focus. |
| Q-4 | Is an LLM needed in v1 at all? | Only for (a) text → goals and (b) naming an unknown context. Everything else rule-based. Send hostname + sanitized title only. |
| Q-5 | Free vs paid | Decide before launch only if you charge at launch; otherwise ship free and keep gating server-side for later. |

---

## 7. Snooze-adaptive grace (D-4)

Proposal: if a user always snoozes at 5 min, raise their grace to 10.

**Risk:** silently learning from snoozes learns from *avoidance* — each snooze makes the next nudge later, ratcheting toward never nudging the people who need it most. It also breaks P2 and §10.4 ("explainable and reversible").

**Recommended version:**
1. **Ask, don't adjust.** After ~3 snoozes on the same kind of detour: *"You usually want ~10 more minutes on YouTube. Make that your default?"* Yes/No.
2. **Only count snoozes that end in a self-return** (genuine need). Snooze → snooze → ignore never raises grace.
3. **Scope per destination/context, cap at 15 min, decay** back down when they start returning early on their own.

Ship v1 with fixed grace + manual setting; build this once outcome metrics (§5 #11) exist to tune it.

---

## 8. Suggested phases

| Phase | Scope | Done when |
|---|---|---|
| **0 · Clean** (days) | Revoke keys, scrub history, `DEBUG=False` default, remove dev reset from popup, delete dead code/files/deps, consolidate docs, honest offline states | No secrets in tree; fresh install shows empty states, not fake data |
| **1 · Foundations** | Auth, `user_id` everywhere, Alembic migrations, typed config, privacy filters in extension | Two accounts see separate data; banking tab never leaves the browser |
| **2 · Engine** | Pure engine + replay tests, `chrome.alarms` timers, tiers, debounce, caps, momentum rule | §19.2 invariants green; nudge fires after a real 5 min even if the tab reloads |
| **3 · Nudge + recovery** | Corner-card nudge, "this is related", tab-group contexts, resume, leave-a-note, pause | Drift → nudge → Back focuses the exact tab; break → resume reopens the group |
| **4 · Dashboard** | Expo web: today's goal, current context, narrative, settings that persist, export/delete | Every button does what it says |
| **5 · Ship** | Narrow permissions, privacy policy, store listing, Sentry, CI | Submitted to Chrome Web Store |
| **v1.1** | Mobile companion | — |

---

## 9. Research

Full evidence with citations: `docs/research/2026-10-10-focus-recovery-research.md`. What it changes in this audit:

| Finding | Implication |
|---|---|
| Visible resumption cues speed return (Iqbal & Horvitz 2007); subtle cues ≈ no cue (Trafton et al. 2005) | Recovery card must be prominent — tab restore alone isn't enough. |
| HabitLab (Kovacs et al. 2018): rotating interventions cut time-on-site 34% but nearly doubled 7-day attrition; a just-in-time explanation raised retention 44% → 79% | Explain each nudge level the first time it appears; let users cap/soften escalation. |
| Blocking helped low-self-control users but raised stress for others (Mark et al. 2018); one sec (PNAS 2023): the *option to dismiss* did the work | Beast Mode stays opt-in and gets a "continue anyway" with a small friction step. |
| Showing broken streaks lowers later engagement; streak repair helps (Silverman & Barasch 2023) | When achievements return: soft reset + repair, no broken-streak UI. |
| No study gives an optimal grace delay | 5-min default is reasonable, not evidence-based → configurable + measured (§5 #11). |
| Chrome's on-device Gemini Nano (Prompt API) works in desktop extensions; no data leaves the device | Candidate for naming contexts/related-checks without sending titles to a server. Hardware-gated → template fallback stays. |
| Chrome Web Store needs: privacy policy naming every data recipient, prominent disclosure + consent, Limited Use statement, single narrow purpose | Add to Phase 5. Consider replacing the `<all_urls>` content script with a nudge shown via `chrome.scripting` only on the active tab. |
| ~74% of self-control tools are blockers; tab managers save context but don't detect drift; no product links declared goal → drift → resumption cue | Position on **getting back**, not blocking. That's the open niche. |
