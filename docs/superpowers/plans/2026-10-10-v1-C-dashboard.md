# FocusGuard v1 · Stream C · Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Expo app into the v1 web dashboard. It signs in with Supabase (email code or Google) and has three tabs: Today, History and Settings. The tabs talk to the backend only through contract C1.

**Architecture:** Pure, import-free TypeScript modules (`day.ts`, `lines.ts`, `story.ts`, `http.ts`) hold every rule worth testing and run under `node --test` with Node 24 type stripping. `supabase.ts` owns the session. `api.ts` is a thin, typed C1 client built from `http.ts`, and it switches to an in-memory demo store (`mock.ts`) when `EXPO_PUBLIC_DEMO_MODE=1`. Screens are plain expo-router files gated by `Stack.Protected` in the root layout. The web build becomes a single-page app (`web.output: "single"`).

**Tech Stack:** Expo SDK 57 (expo-router 57, react-native-web, NativeWind 4), `@supabase/supabase-js` v2 with the already-installed `@react-native-async-storage/async-storage` as session storage, `node --test` (Node v24) for pure modules, plus `tsc`, `expo lint` and `expo export`.

**Spec:** `docs/specs/2026-10-10-v1-core-design.md` (§3.1 auth, §5 dashboard, §6 errors, §7 testing). Contract C1 and the global constraints come from `docs/superpowers/plans/2026-10-10-v1-core-index.md`. Token flow: `docs/research/2026-10-10-auth-hosting.md` §3.

### Expo v57 docs read for this plan (AGENTS.md rule), and what each one decided

| Page | Informs |
|---|---|
| https://docs.expo.dev/guides/using-supabase/ | Task 1/6: install with `npx expo install @supabase/supabase-js`. **No `react-native-url-polyfill`** ("Expo installs a `URL` global already"). `detectSessionInUrl: false` on native. `AppState` → `startAutoRefresh`/`stopAutoRefresh`. *Deviation:* the guide uses `expo-sqlite/localStorage`; we use the AsyncStorage that is already installed (ponytail: no new dependency). |
| https://docs.expo.dev/versions/v57.0.0/sdk/async-storage/ | Task 6: AsyncStorage supports Web, so one storage adapter covers web and native. |
| https://docs.expo.dev/guides/environment-variables/ | Task 1/6: read `process.env.EXPO_PUBLIC_*` with **dot notation only** (no destructuring, no `process.env['…']`). Values are inlined into the public bundle, so only the anon key goes there and never a secret. |
| https://docs.expo.dev/versions/v57.0.0/config/app/ | Task 1: `web.output` accepts `single` (one `index.html` SPA), `static` or `server`. |
| https://docs.expo.dev/router/reference/static-rendering/ | Task 1: `static` renders every route in Node at build time with no browser APIs. supabase-js and AsyncStorage touch `window`/`localStorage` on init, and every dashboard route is behind auth anyway, so we switch to `single`. |
| https://docs.expo.dev/router/advanced/protected/ | Task 8: `<Stack.Protected guard={…}>`. A false guard redirects to the first available screen. `redirectTo` needs **SDK 58**, so we don't use it. Protection is client-side only (the backend still checks every token). |
| https://docs.expo.dev/versions/v57.0.0/sdk/router/ | Tasks 7/9/10: `useFocusEffect(useCallback(…))` reloads data each time a tab gains focus. |
| https://docs.expo.dev/develop/unit-testing/ | Task 1: `jest-expo` needs `jest-expo`, `jest`, `@types/jest`, a preset and tsconfig `types`. That is too heavy for testing four pure modules, so we use `node --test` (zero new dependencies). |

## Global Constraints

- Executors **never run git**. Every "Report to lead" step lists the files changed and pastes the test output.
- Edit only `src/**`, root `package.json`, `package-lock.json`, `app.json` and root `.env.example`. Anything needed elsewhere goes in your report.
- Read the v57 docs above before touching the Expo API each task names (AGENTS.md: "Expo HAS CHANGED").
- C1 is exact: base `${EXPO_PUBLIC_API_URL}/api`, header `Authorization: Bearer <supabase access_token>`, ISO-8601 UTC timestamps, `day` = `YYYY-MM-DD` in the **user's profile tz**.
- Grace default 300 s. Server range 120–900. Dashboard chips are 120 / 300 / 600.
- Quiet hours: ≤3 ranges `{from:"HH:MM", to:"HH:MM"}`.
- Goal title ≤200 chars. `POST /goals {lines}` splits on newlines, trims, drops empties, ≤20.
- Copy follows the SPEC §10.3 voice. The banned words `lazy, failed, wasted, distracted again, you should have, disappointing` never appear in any user-visible string. No score anywhere.
- Accessibility: every interactive control has `accessibilityRole` + `accessibilityLabel` (or visible text as its label), and touch targets are ≥44 px (`min-h-[44px]` / `w-11 h-11`).
- Env vars: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_DEMO_MODE` (`1` = demo, no network, no sign-in).
- Dashboard sign-out uses `signOut({ scope: 'local' })`. The default `global` scope would also revoke the extension's separate session (spec §3.1: separate sessions).
- Server stores hostnames, never page titles or URLs. The dashboard only displays what C1 returns.
- Pure modules (`src/lib/day.ts`, `lines.ts`, `story.ts`, `http.ts`) have **no runtime imports**, only `import type`. They must not use enums, namespaces or constructor parameter properties, because Node's type stripping can't run them.
- UI verification is `npx tsc --noEmit`, `npx expo lint` and `npx expo export --platform web`. There are no UI unit tests.

## Review Focus

1. **User in UTC+5:45 (Asia/Kathmandu) opens the dashboard at 00:05 local, or at 23:55.** Today's goals and totals must use the profile-tz local day, not UTC and not the browser's tz. *(Task 2: `localDay` / `recentDays` tests.)*
2. **Access token expires while the dashboard sits open, or the account was deleted from another device.** The client refreshes once and retries. If that fails, the user lands on Sign in with "Your session ended. Please sign in again.", never a blank screen or a raw error. If the refresh only failed because the network is down, the stored session is kept and the user sees the offline message instead. *(Task 5: http 401 and offline-refresh tests; Task 6 `getToken`/`refresh` + `sessionNotice`; Task 8 Sign in shows the message after the failing screen unmounts.)*
3. **User pastes a brain-dump with blank lines, CRLF, 25 lines or a 300-char line.** The preview count equals what the server will create, and over-limit input is blocked before any POST with a plain reason. *(Task 2: `splitLines` / `linesError` tests.)*
4. **Hard day (5 check-ins, 25-min detour) or a day with nothing recorded.** The story stays neutral, shows no score, uses no banned word and is never empty. *(Task 3: story tests.)*
5. **Quiet hours typed as `9:00`, `24:00`, the same start and end, or a 4th period.** These are rejected client-side with a clear message and nothing is PATCHed. Overnight `22:00→07:00` is allowed. *(Task 2: `quietHoursError` tests.)*

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/day.ts` (new, pure) | `localDay`, `recentDays`, `dayLabel`, `deviceTz`, `isHHMM`, `quietHoursError` |
| `src/lib/lines.ts` (new, pure) | `splitLines`, `linesError`, `MAX_LINES`, `MAX_TITLE`: preview mirror of the server splitter |
| `src/lib/story.ts` (new, pure) | `storyFor`, `fmtDuration`, `BANNED_WORDS` |
| `src/css-modules.d.ts` (new) | `declare module '*.css'` so `tsc --noEmit` passes on a clean checkout |
| `src/lib/http.ts` (new, pure) | `makeCaller` (Bearer, timeout, refresh-once, finish a pending delete, honest errors), `ApiError`, `MESSAGES`, `errorText` |
| `src/lib/types.ts` (new) | C1 types, verbatim |
| `src/lib/supabase.ts` (new) | client, `DEMO`, `AUTH_CONFIGURED`, `useSession` |
| `src/lib/api.ts` (rewrite) | typed C1 calls, demo switch, offline-safe token hooks, `pendingDelete` flag |
| `src/lib/mock.ts` (rewrite) | in-memory demo store shaped to C1 |
| `src/lib/*.test.mjs` (new) | `node --test` suites for the pure modules |
| `src/components/button.tsx` (new) | 44 px accessible button used by every screen |
| `src/components/bottom-tab-bar.tsx` (rewrite) | Today / History / Settings, tab roles |
| `src/components/mode-pill.tsx` (edit import) | `Mode` from `@/lib/types` |
| `src/app/_layout.tsx` (rewrite) | fonts + auth gate |
| `src/app/sign-in.tsx` (new) | email code + Google (web) |
| `src/app/(tabs)/_layout.tsx` (rewrite) | three tabs |
| `src/app/(tabs)/index.tsx` (rewrite) | Today |
| `src/app/(tabs)/history.tsx` (new) | History |
| `src/app/(tabs)/settings.tsx` (new) | Settings |
| **Deleted** | `src/app/(tabs)/contexts.tsx`, `progress.tsx`, `support.tsx`, `src/app/settings.tsx`, `src/components/top-app-bar.tsx`; deps `expo-notifications` (Task 4) and `expo-document-picker` (Task 7, once the old Today screen is gone) |

---

### Task 1: Install, test runner, env, SPA output

**Files:**
- Modify: `package.json` (scripts, deps), `package-lock.json` (via npm), `app.json:22-26`, `.env.example`
- Create: `src/css-modules.d.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs `node --test` over `src/**/*.test.mjs`. `@supabase/supabase-js` is installed. `@types/chrome` is in root `devDependencies` (index R30, consumed by A's `extension/jsconfig.json` per R37). `web.output` is `"single"`. `npx tsc --noEmit` passes on a clean checkout (no `expo start` needed first).

- [ ] **Step 1: Read the docs this task depends on**

Read https://docs.expo.dev/guides/using-supabase/, https://docs.expo.dev/versions/v57.0.0/config/app/ (search `web.output`) and https://docs.expo.dev/guides/environment-variables/.

- [ ] **Step 2: Install existing dependencies**

Run: `npm install`
Expected: completes without `ERESOLVE` errors and creates `node_modules/`.

- [ ] **Step 3: Install supabase-js through Expo's resolver**

Run: `npx expo install @supabase/supabase-js`
Expected: `package.json` `dependencies` gains `"@supabase/supabase-js": "^2.x.y"`. Do **not** install `react-native-url-polyfill` or `expo-sqlite` (see the docs table).

Run: `npx expo install --check`
Expected: "Dependencies are up to date", or a list of mismatches. If it lists mismatches, run `npx expo install --fix` and paste the output in your report.

- [ ] **Step 3b: Add `@types/chrome` for the extension type-check (index R30)**

Run: `npm install --save-dev @types/chrome`
Use plain npm, not `expo install`: this is a dev-only type package outside the Expo SDK version map. `package-lock.json` pins the exact version.
Expected: `package.json` `devDependencies` gains `"@types/chrome"`, and `node -e "require.resolve('@types/chrome/package.json')"` exits 0.

The root `tsconfig.json` has no `types` filter, so the global `chrome` namespace also becomes visible to the dashboard compile. That is harmless. Step 7 re-checks it: if `npx tsc --noEmit` reports conflicts coming from `@types/chrome` (or the `@types/filesystem` / `@types/har-format` it pulls in), stop and report to the lead. Do not edit `tsconfig.json`, and do not create `extension/jsconfig.json` (stream A owns it, R37).

- [ ] **Step 4: Add the test script**

In `package.json`, replace the `"scripts"` block with:

```json
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "expo lint",
    "test": "node --experimental-strip-types --test \"src/**/*.test.mjs\""
  },
```

(Node 24 expands the quoted glob itself, so this works in cmd, PowerShell and bash. Type stripping is on by default in Node 24, and the flag only makes the requirement explicit.)

- [ ] **Step 5: Switch web output to a single-page app**

In `app.json`, change the `"web"` block to the following. `web.name` sets the page `<title>` to the R39 product name "FocusGuard AI". `expo.name`, `slug` and `scheme` stay as they are, so the native identifiers and the `focusguard://` deep links don't change:

```json
    "web": {
      "name": "FocusGuard AI",
      "output": "single",
      "favicon": "./assets/images/favicon.png",
      "backgroundColor": "#fcf8ff"
    },
```

- [ ] **Step 6: Rewrite `.env.example`**

Replace the whole file with:

```dotenv
# ============================================================
# FocusGuard dashboard (Expo) — copy to .env and fill in.
# EXPO_PUBLIC_* values are inlined into the PUBLIC web bundle.
# Never put a secret here. The Supabase anon key is public by design;
# the service-role key belongs to the backend only.
# ============================================================

# FastAPI backend (contract C1 lives under /api).
EXPO_PUBLIC_API_URL=http://localhost:8000

# Supabase project (Settings → API).
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>

# 1 = run on in-memory demo data: no sign-in, no network calls.
EXPO_PUBLIC_DEMO_MODE=0
```

(The old `EXTENSION_BACKEND_URL` line is dropped. The extension reads its own `config.local.json`, which stream D owns.)

- [ ] **Step 6b: Declare CSS side-effect imports for `tsc`**

On a clean checkout `npx tsc --noEmit` fails with `src/app/_layout.tsx(6,8): error TS2882: Cannot find module or type declarations for side-effect import of '@/global.css'`. TypeScript 6 checks side-effect imports, and Expo's `declare module '*.css'` (in `expo/types`) only loads through the gitignored `expo-env.d.ts`, which only `expo start`/`expo export` generate. Create `src/css-modules.d.ts`:

```ts
declare module '*.css';
```

The existing tsconfig `include` (`**/*.ts`) picks it up. It merges harmlessly with Expo's identical declaration once `expo-env.d.ts` exists. Do not edit `tsconfig.json` or `.gitignore`.

- [ ] **Step 7: Baseline checks on the untouched app**

Run: `npx tsc --noEmit`
Expected: exit 0, with no TS2882. If anything else fails, paste the errors in your report as **pre-existing** and continue.

Run: `npx expo lint`
Expected: no errors (warnings are OK). If it fails, record it the same way.

- [ ] **Step 8: Report to lead**

Files changed: `package.json`, `package-lock.json`, `app.json`, `.env.example`, `src/css-modules.d.ts`. State the installed `@types/chrome` version so the lead can confirm R30/R37 are met (A's `"types": ["chrome"]` resolves once this lands). Paste the output of Steps 3, 3b and 7.

---

### Task 2: Pure helpers: local days, quiet hours, goal-line preview

**Files:**
- Create: `src/lib/day.ts`, `src/lib/lines.ts`
- Test: `src/lib/day.test.mjs`, `src/lib/lines.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `deviceTz(): string`
  - `localDay(now: Date, tz: string): string`: `YYYY-MM-DD`
  - `recentDays(n: number, now: Date, tz: string): string[]`: newest first, `[0]` is today
  - `dayLabel(day: string, locale?: string): string`: e.g. `"Saturday, Oct 10"`
  - `isHHMM(s: string): boolean`
  - `quietHoursError(ranges: { from: string; to: string }[]): string | null`
  - `MAX_LINES = 20`, `MAX_TITLE = 200`
  - `splitLines(text: string): string[]`
  - `linesError(lines: string[]): string | null`

- [ ] **Step 1: Write the failing tests**

`src/lib/day.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayLabel, isHHMM, localDay, quietHoursError, recentDays } from './day.ts';

test('localDay: Kathmandu (UTC+5:45) five minutes after local midnight is the new day', () => {
  assert.equal(localDay(new Date('2026-10-09T18:20:00Z'), 'Asia/Kathmandu'), '2026-10-10');
});

test('localDay: Kathmandu at 23:55 local is still that day', () => {
  assert.equal(localDay(new Date('2026-10-10T18:10:00Z'), 'Asia/Kathmandu'), '2026-10-10');
});

test('localDay: Los Angeles evening is the previous UTC day', () => {
  assert.equal(localDay(new Date('2026-10-10T03:00:00Z'), 'America/Los_Angeles'), '2026-10-09');
});

test('recentDays: newest first, anchored on the local day', () => {
  assert.deepEqual(recentDays(3, new Date('2026-10-09T18:20:00Z'), 'Asia/Kathmandu'), [
    '2026-10-10',
    '2026-10-09',
    '2026-10-08',
  ]);
});

test('recentDays: crosses a month boundary', () => {
  assert.deepEqual(recentDays(2, new Date('2026-03-01T12:00:00Z'), 'UTC'), ['2026-03-01', '2026-02-28']);
});

test('dayLabel: names the calendar day without shifting it', () => {
  assert.equal(dayLabel('2026-10-10', 'en-US'), 'Saturday, Oct 10');
});

test('isHHMM: 24-hour HH:MM only', () => {
  assert.equal(isHHMM('22:00'), true);
  assert.equal(isHHMM('07:30'), true);
  assert.equal(isHHMM('00:00'), true);
  assert.equal(isHHMM('9:00'), false);
  assert.equal(isHHMM('24:00'), false);
  assert.equal(isHHMM('12:60'), false);
  assert.equal(isHHMM(''), false);
});

test('quietHoursError: accepts none, and overnight ranges', () => {
  assert.equal(quietHoursError([]), null);
  assert.equal(quietHoursError([{ from: '22:00', to: '07:00' }]), null);
});

test('quietHoursError: rejects a 4th period', () => {
  const r = { from: '22:00', to: '07:00' };
  assert.match(quietHoursError([r, r, r, r]) ?? '', /up to 3/i);
});

test('quietHoursError: rejects malformed times and names the period', () => {
  assert.match(quietHoursError([{ from: '22:00', to: '07:00' }, { from: '9:00', to: '10:00' }]) ?? '', /24-hour.*period 2/i);
  assert.match(quietHoursError([{ from: '22:00', to: '24:00' }]) ?? '', /24-hour/i);
});

test('quietHoursError: rejects same start and end', () => {
  assert.match(quietHoursError([{ from: '10:00', to: '10:00' }]) ?? '', /same time/i);
});
```

`src/lib/lines.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LINES, MAX_TITLE, linesError, splitLines } from './lines.ts';

test('splitLines: trims, drops blanks, handles CRLF and lone CR', () => {
  assert.deepEqual(splitLines('a\n\n  b  \r\nc\rd\n'), ['a', 'b', 'c', 'd']);
});

test('splitLines: whitespace-only input gives nothing', () => {
  assert.deepEqual(splitLines('   \n\t\n'), []);
});

test('splitLines: commas stay inside one goal (server splits on newlines only)', () => {
  assert.deepEqual(splitLines('a\nb, c'), ['a', 'b, c']);
});

test('linesError: 20 lines is fine, 21 is blocked with the count', () => {
  const twenty = Array.from({ length: MAX_LINES }, (_, i) => `goal ${i}`);
  assert.equal(linesError(twenty), null);
  assert.match(linesError([...twenty, 'one more']) ?? '', /21 goals.*up to 20/i);
});

test('linesError: a title over 200 chars is blocked and named', () => {
  assert.equal(linesError(['x'.repeat(MAX_TITLE)]), null);
  assert.match(linesError(['ok', 'x'.repeat(MAX_TITLE + 1)]) ?? '', /goal 2.*200/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./day.ts` and `./lines.ts`.

- [ ] **Step 3: Write the implementation**

`src/lib/day.ts`:

```ts
// Pure date helpers. No runtime imports: tested directly by `node --test` (type stripping).

/** IANA zone of this device, e.g. "Asia/Kathmandu". */
export function deviceTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** YYYY-MM-DD of `now` as seen in IANA zone `tz`. */
export function localDay(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The last `n` local days ending today, newest first. Date arithmetic in UTC so DST never skips a day. */
export function recentDays(n: number, now: Date, tz: string): string[] {
  const today = Date.parse(`${localDay(now, tz)}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(today - i * 86_400_000).toISOString().slice(0, 10));
}

/** "Saturday, Oct 10" for a YYYY-MM-DD day (rendered at UTC noon so no zone can shift it). */
export function dayLabel(day: string, locale?: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function isHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Client-side check before PATCH /me settings.quiet_hours. Overnight ranges (22:00→07:00) are valid. */
export function quietHoursError(ranges: { from: string; to: string }[]): string | null {
  if (ranges.length > 3) return 'You can have up to 3 quiet periods.';
  for (let i = 0; i < ranges.length; i++) {
    const { from, to } = ranges[i];
    if (!isHHMM(from) || !isHHMM(to)) return `Use 24-hour time like 22:00 (period ${i + 1}).`;
    if (from === to) return `Period ${i + 1} starts and ends at the same time.`;
  }
  return null;
}
```

`src/lib/lines.ts`:

```ts
// Preview mirror of the server goal splitter (spec §3.3). No runtime imports.

export const MAX_LINES = 20;
export const MAX_TITLE = 200;

/** Split on newlines (\r\n, \r, \n), trim, drop empties — exactly what POST /goals {lines} creates. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Why these lines can't be sent, or null. Blocks before POST instead of relying on server truncation. */
export function linesError(lines: string[]): string | null {
  if (lines.length > MAX_LINES) return `That's ${lines.length} goals. Add up to ${MAX_LINES} at a time.`;
  const long = lines.findIndex((l) => l.length > MAX_TITLE);
  if (long >= 0) return `Goal ${long + 1} is over ${MAX_TITLE} characters. Try a shorter title.`;
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, with all `day` and `lines` tests ok. A `MODULE_TYPELESS_PACKAGE_JSON` or `ExperimentalWarning` line is OK. Do **not** add `"type": "module"` to the root `package.json`, because it breaks `babel.config.js`/`metro.config.js`.

- [ ] **Step 5: Lint the new files**

Run: `npx expo lint`
Expected: no errors. If `import/no-unresolved` fires on the `./day.ts` / `./lines.ts` imports in the `.test.mjs` files (and only there), add this as the line directly above that import in each test file:

```js
// eslint-disable-next-line import/no-unresolved -- Node resolves .ts via type stripping
```

Then re-run `npx expo lint` and expect no errors.

- [ ] **Step 6: Report to lead**

Files: `src/lib/day.ts`, `src/lib/lines.ts`, `src/lib/day.test.mjs`, `src/lib/lines.test.mjs`. Paste the `npm test` output.

---

### Task 3: `storyFor`: a calm story per day

**Files:**
- Create: `src/lib/story.ts`, `src/lib/types.ts`
- Test: `src/lib/story.test.mjs`

**Interfaces:**
- Consumes: nothing at runtime. `import type { DailyTotals } from './types'`.
- Produces:
  - `src/lib/types.ts`: the C1 types (also used by Tasks 5–10): `QuietRange`, `Settings`, `Profile`, `Mode`, `Goal`, `ContextState`, `ContextSnap`, `DailyTotals`, `ExportBundle`, `MePatch`, `GoalPatch`
  - `fmtDuration(s: number): string`
  - `storyFor(t: DailyTotals | null | undefined): string`
  - `BANNED_WORDS: readonly string[]`

- [ ] **Step 1: Create the C1 types (needed by the story module)**

`src/lib/types.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing test**

`src/lib/story.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANNED_WORDS, fmtDuration, storyFor } from './story.ts';

const T = (o = {}) => ({
  day: '2026-10-10',
  focus_s: 0,
  nudges: 0,
  self_returns: 0,
  recoveries: 0,
  snoozes: 0,
  breaks: 0,
  longest_detour_s: 0,
  ...o,
});

test('fmtDuration', () => {
  assert.equal(fmtDuration(0), 'under a minute');
  assert.equal(fmtDuration(59), 'under a minute');
  assert.equal(fmtDuration(60), '1 min');
  assert.equal(fmtDuration(3600), '1 h');
  assert.equal(fmtDuration(3660), '1 h 1 min');
  assert.equal(fmtDuration(5400), '1 h 30 min');
});

test('nothing recorded: null, undefined and all-zero days', () => {
  assert.equal(storyFor(null), 'Nothing recorded for this day.');
  assert.equal(storyFor(undefined), 'Nothing recorded for this day.');
  assert.equal(storyFor(T()), 'Nothing recorded for this day.');
});

test('smooth day', () => {
  assert.equal(
    storyFor(T({ focus_s: 5400, nudges: 1, self_returns: 2, breaks: 1 })),
    'A smooth day. You spent 1 h 30 min in focus. FocusGuard AI checked in once. You came back on your own twice. You took a break.',
  );
});

test('hard day is stated neutrally, with the longest detour', () => {
  assert.equal(
    storyFor(T({ focus_s: 3600, nudges: 5, self_returns: 1, recoveries: 3, breaks: 2, longest_detour_s: 1500 })),
    "A bumpy day, and that's okay. You spent 1 h in focus. FocusGuard AI checked in 5 times. You came back on your own once. Your longest detour was 25 min. You took 2 breaks.",
  );
});

test('no check-ins needed', () => {
  assert.equal(storyFor(T({ focus_s: 1200 })), "You spent 20 min in focus. FocusGuard AI didn't need to check in.");
});

test('little focus time is not blamed', () => {
  assert.equal(storyFor(T({ breaks: 1 })), "Not much focus time was recorded. FocusGuard AI didn't need to check in. You took a break.");
});

test('never a banned word, a score or a percentage, across a grid of days', () => {
  for (const focus_s of [0, 30, 600, 1800, 7200])
    for (const nudges of [0, 1, 2, 3, 9])
      for (const self_returns of [0, 1, 4])
        for (const breaks of [0, 1, 3])
          for (const longest_detour_s of [0, 120, 900, 3600]) {
            const s = storyFor(T({ focus_s, nudges, self_returns, breaks, longest_detour_s })).toLowerCase();
            assert.ok(s.length > 0);
            for (const w of BANNED_WORDS) assert.ok(!s.includes(w), `"${w}" in: ${s}`);
            assert.ok(!s.includes('%') && !s.includes('score'), s);
          }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL. `story.test.mjs` reports `ERR_MODULE_NOT_FOUND` for `./story.ts`, while the Task 2 suites still pass.

- [ ] **Step 4: Write the implementation**

`src/lib/story.ts`:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, with all suites (day, lines, story) ok. If lint later flags the `./story.ts` import, apply the Task 2 Step 5 disable comment to `story.test.mjs`.

- [ ] **Step 6: Report to lead**

Files: `src/lib/types.ts`, `src/lib/story.ts`, `src/lib/story.test.mjs`. Paste the `npm test` output.

---

### Task 4: Prune the hackathon screens and set up three tabs

**Files:**
- Delete: `src/app/(tabs)/contexts.tsx`, `src/app/(tabs)/progress.tsx`, `src/app/(tabs)/support.tsx`, `src/app/settings.tsx`, `src/components/top-app-bar.tsx`
- Modify: `src/app/_layout.tsx` (remove the `settings` stack screen), `src/app/(tabs)/_layout.tsx`, `src/components/bottom-tab-bar.tsx`, `package.json`/`package-lock.json` (uninstall `expo-notifications`; `expo-document-picker` stays until Task 7)

**Interfaces:**
- Consumes: nothing new.
- Produces: `TAB_ROUTES` with names `index`, `history`, `settings`. The tab layout lists `index` now. Tasks 9 and 10 add `history` and `settings`.

- [ ] **Step 1: Confirm what only the doomed screens use**

Run:

```bash
grep -rn "top-app-bar\|TopAppBar" src
grep -rn "expo-document-picker\|expo-notifications\|parseServerUtc" src
```

Expected: `TopAppBar` is used only in `contexts.tsx`, `progress.tsx`, `support.tsx` and `src/app/settings.tsx`. `expo-document-picker` is used only in `src/app/(tabs)/index.tsx` (rewritten in Task 7), so it is **not** uninstalled here: Task 7 Step 3b removes it after the rewrite. `expo-notifications` and `parseServerUtc` are used only in `support.tsx`. If any other file shows up, keep that module and note it in the report.

`card`, `empty-state`, `icon`, `mascot`, `mode-pill`, `app-text`, `use-dashboard-layout` and `use-theme-colors` stay, because the new screens use them. `react-native-svg` stays too: it was only used by `progress.tsx`, but NativeWind's css-interop lists it as an optional peer, and removing it isn't worth the risk in this stream.

- [ ] **Step 2: Delete the files**

```bash
rm "src/app/(tabs)/contexts.tsx" "src/app/(tabs)/progress.tsx" "src/app/(tabs)/support.tsx" src/app/settings.tsx src/components/top-app-bar.tsx
```

- [ ] **Step 3: Uninstall the dependency only the deleted code used**

Run: `npm uninstall expo-notifications`
Expected: gone from `package.json`. `app.json` `plugins` never listed it, so it needs no change. Leave `expo-document-picker` installed: the old `src/app/(tabs)/index.tsx` still imports it until Task 7 replaces that file, and uninstalling it now would make Step 7's `tsc`/`lint` fail with TS2307 / `import/no-unresolved`.

- [ ] **Step 4: Root layout — drop the deleted stack screen**

In `src/app/_layout.tsx`, replace:

```tsx
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
      </Stack>
```

with:

```tsx
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
```

- [ ] **Step 5: Tabs layout**

Replace `src/app/(tabs)/_layout.tsx` with:

```tsx
import { Tabs } from 'expo-router';

import { BottomTabBar } from '@/components/bottom-tab-bar';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BottomTabBar {...props} />}>
      <Tabs.Screen name="index" />
    </Tabs>
  );
}
```

- [ ] **Step 6: Tab bar — Today / History / Settings with tab semantics and 44 px targets**

Replace `src/components/bottom-tab-bar.tsx` with:

```tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Palette } from '@/theme';
import { cn } from '@/theme/tailwind';

type TabRoute = {
  name: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconActive: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

export const TAB_ROUTES: TabRoute[] = [
  { name: 'index', label: 'Today', icon: 'weather-sunny', iconActive: 'weather-sunny' },
  { name: 'history', label: 'History', icon: 'history', iconActive: 'history' },
  { name: 'settings', label: 'Settings', icon: 'cog-outline', iconActive: 'cog' },
];

type BottomTabBarProps = {
  state: { index: number; routes: { name: string }[] };
  navigation: { navigate: (name: string) => void };
};

export function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;

  return (
    <View
      style={isDesktop
        ? { position: 'absolute', left: 20, top: 20 + insets.top, bottom: 20 + insets.bottom, width: 224 }
        : { paddingBottom: Math.max(insets.bottom, 12) }}
      className={cn(
        'bg-surface-container-lowest border border-outline-variant/70',
        isDesktop ? 'rounded-[28px] p-md' : 'mx-md mb-sm px-sm pt-sm rounded-[24px]',
      )}>
      <View
        accessibilityRole="tablist"
        className={cn(isDesktop ? 'flex-1 gap-xs' : 'flex-row items-center justify-around')}>
        {isDesktop ? (
          <View className="flex-row items-center gap-sm px-sm pb-lg mb-sm border-b border-outline-variant/70">
            <View className="w-9 h-9 rounded-[14px] bg-primary items-center justify-center">
              <MaterialCommunityIcons name="shield-check" size={20} color={Palette.onPrimary} />
            </View>
            <View>
              <AppText variant="labelLg">FocusGuard AI</AppText>
              <AppText variant="labelSm" color="on-surface-variant">Focus workspace</AppText>
            </View>
          </View>
        ) : null}
        {state.routes.map((route, index) => {
          const def = TAB_ROUTES.find((r) => r.name === route.name);
          if (!def) return null;
          const focused = state.index === index;

          return (
            <Pressable
              key={route.name}
              accessibilityRole="tab"
              accessibilityLabel={def.label}
              accessibilityState={{ selected: focused }}
              onPress={() => navigation.navigate(route.name)}
              className={cn(
                'min-h-[44px] flex-row items-center gap-[8px] rounded-[14px] px-md py-sm active:opacity-80',
                isDesktop && 'w-full justify-start',
                focused ? 'bg-primary' : 'bg-transparent',
              )}>
              <MaterialCommunityIcons
                name={focused ? def.iconActive : def.icon}
                size={20}
                color={focused ? Palette.onPrimary : Palette.onSurfaceVariant}
              />
              <AppText variant="labelSm" color={focused ? 'on-primary' : 'on-surface-variant'}>
                {def.label}
              </AppText>
            </Pressable>
          );
        })}
        {isDesktop ? (
          <View className="mt-auto rounded-[18px] bg-primary-container p-md gap-xs">
            <AppText variant="labelSm" color="on-primary-container">Quietly protecting your attention.</AppText>
            <AppText variant="labelSm" color="primary">Focus better, one day at a time.</AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0. The only acceptable exception: if `.expo/types` exists from an earlier `expo start`/`export`, typed-route errors for `'/progress'`, `'/contexts'`, `'/support'` or `'/settings'` inside `src/app/(tabs)/index.tsx`. That file is replaced in Task 7. Any other error means stop and fix it.

Run: `npx expo lint`
Expected: no errors.

Run: `npm test`
Expected: PASS (unchanged).

- [ ] **Step 8: Report to lead**

Files: the deleted list, `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`, `src/components/bottom-tab-bar.tsx`, `package.json`, `package-lock.json`. Paste the grep output from Step 1 and the verification output.

---

### Task 5: `http.ts`: Bearer, timeout, refresh-once, pending delete, honest errors

**Files:**
- Create: `src/lib/http.ts`
- Test: `src/lib/http.test.mjs`

**Interfaces:**
- Consumes: nothing (pure; `fetch` is injected).
- Produces:
  - `class ApiError extends Error { status: number }`. `status` is `0` for offline or timeout.
  - `type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'`
  - `type CallerDeps = { baseUrl: string; getToken: () => Promise<string | null>; refresh: () => Promise<boolean>; onSignedOut: () => Promise<void> | void; pendingDelete?: { get: () => Promise<boolean>; clear: () => Promise<void> }; fetchImpl?: typeof fetch; timeoutMs?: number }`. `getToken`/`refresh` may reject with an `ApiError`; it reaches the caller unchanged and never signs out.
  - `makeCaller(deps: CallerDeps): <T>(method: Method, path: string, body?: unknown) => Promise<T>`. Before a forced sign-out, if `pendingDelete.get()` is true it sends one `DELETE /me` with the current token and clears the flag on 204 (index R9).
  - `MESSAGES` (user-facing strings), `messageFor(status: number, detail: string): string`, `errorText(e: unknown): string`

- [ ] **Step 1: Write the failing test**

`src/lib/http.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, MESSAGES, errorText, makeCaller } from './http.ts';

const reply = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setup({ replies = [], tokens = ['tok'], refreshOk = false, timeoutMs, getToken, refresh, pending } = {}) {
  const seen = [];
  let signedOut = 0;
  let requestsBeforeSignOut = -1;
  const call = makeCaller({
    baseUrl: 'http://api.test/api',
    getToken: getToken ?? (async () => (tokens.length > 1 ? tokens.shift() : tokens[0])),
    refresh: refresh ?? (async () => refreshOk),
    onSignedOut: () => {
      signedOut += 1;
      requestsBeforeSignOut = seen.length;
    },
    pendingDelete: pending,
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      const r = replies.shift();
      if (r instanceof Error) throw r;
      return typeof r === 'function' ? r(init) : r;
    },
    timeoutMs,
  });
  return { call, seen, signedOut: () => signedOut, requestsBeforeSignOut: () => requestsBeforeSignOut };
}

const offline = () => new ApiError(0, MESSAGES.offline);

/** In-memory stand-in for api.ts's AsyncStorage-backed flag. */
function flag(on) {
  const f = { on, get: async () => f.on, clear: async () => { f.on = false; } };
  return f;
}

const isApiError = (status, re) => (e) => {
  assert.ok(e instanceof ApiError, `not an ApiError: ${e}`);
  assert.equal(e.status, status);
  assert.match(e.message, re);
  return true;
};

test('sends the bearer token and a JSON body, parses the JSON reply', async () => {
  const s = setup({ replies: [reply(201, [{ id: 'g1' }])] });
  const out = await s.call('POST', '/goals', { lines: 'a', day: '2026-10-10' });
  assert.deepEqual(out, [{ id: 'g1' }]);
  assert.equal(s.seen[0].url, 'http://api.test/api/goals');
  assert.equal(s.seen[0].init.method, 'POST');
  assert.equal(s.seen[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(s.seen[0].init.headers['Content-Type'], 'application/json');
  assert.equal(s.seen[0].init.body, JSON.stringify({ lines: 'a', day: '2026-10-10' }));
});

test('GET sends no body and no Content-Type', async () => {
  const s = setup({ replies: [reply(200, { tz: 'UTC' })] });
  await s.call('GET', '/me');
  assert.equal(s.seen[0].init.body, undefined);
  assert.equal(s.seen[0].init.headers['Content-Type'], undefined);
});

test('204 resolves to undefined', async () => {
  const s = setup({ replies: [new Response(null, { status: 204 })] });
  assert.equal(await s.call('DELETE', '/goals/g1'), undefined);
});

test('401 → refresh once → retry with the new token', async () => {
  const s = setup({ tokens: ['tok1', 'tok2'], refreshOk: true, replies: [reply(401, { detail: 'expired' }), reply(200, { tz: 'UTC' })] });
  assert.deepEqual(await s.call('GET', '/me'), { tz: 'UTC' });
  assert.equal(s.seen.length, 2);
  assert.equal(s.seen[1].init.headers.Authorization, 'Bearer tok2');
  assert.equal(s.signedOut(), 0);
});

test('401 and refresh fails → signed out with a plain message, no second request', async () => {
  const s = setup({ replies: [reply(401, { detail: 'expired' })] });
  await assert.rejects(s.call('GET', '/me'), isApiError(401, /sign in again/i));
  assert.equal(s.seen.length, 1);
  assert.equal(s.signedOut(), 1);
});

test('401 twice (refresh succeeded but token still rejected) → signed out', async () => {
  const s = setup({ refreshOk: true, replies: [reply(401, {}), reply(401, {})] });
  await assert.rejects(s.call('GET', '/me'), isApiError(401, /sign in again/i));
  assert.equal(s.seen.length, 2);
  assert.equal(s.signedOut(), 1);
});

test('no session token → signed out without any request', async () => {
  const s = setup({ tokens: [null] });
  await assert.rejects(s.call('GET', '/me'), isApiError(401, /sign in again/i));
  assert.equal(s.seen.length, 0);
  assert.equal(s.signedOut(), 1);
});

test('getToken offline (refresh hit a network error) → status 0, never signs out', async () => {
  const s = setup({ getToken: async () => Promise.reject(offline()) });
  await assert.rejects(s.call('GET', '/me'), isApiError(0, /can't reach/i));
  assert.equal(s.seen.length, 0);
  assert.equal(s.signedOut(), 0);
});

test('401 then refresh offline → status 0, never signs out', async () => {
  const s = setup({ refresh: async () => Promise.reject(offline()), replies: [reply(401, {})] });
  await assert.rejects(s.call('GET', '/me'), isApiError(0, /can't reach/i));
  assert.equal(s.seen.length, 1);
  assert.equal(s.signedOut(), 0);
});

test('pending delete + 401 twice → sends DELETE /me before signing out, clears the flag on 204 (index R9)', async () => {
  const pending = flag(true);
  const s = setup({ refreshOk: true, pending, replies: [reply(401, {}), reply(401, {}), new Response(null, { status: 204 })] });
  await assert.rejects(s.call('GET', '/me'), isApiError(401, /sign in again/i));
  assert.equal(s.seen.length, 3);
  assert.equal(s.seen[2].url, 'http://api.test/api/me');
  assert.equal(s.seen[2].init.method, 'DELETE');
  assert.equal(s.seen[2].init.headers.Authorization, 'Bearer tok');
  assert.equal(s.requestsBeforeSignOut(), 3);
  assert.equal(s.signedOut(), 1);
  assert.equal(pending.on, false);
});

test('pending delete that gets 502 again keeps the flag for next time', async () => {
  const pending = flag(true);
  const s = setup({ refreshOk: true, pending, replies: [reply(401, {}), reply(401, {}), reply(502, {})] });
  await assert.rejects(s.call('GET', '/me'), isApiError(401, /sign in again/i));
  assert.equal(s.seen.length, 3);
  assert.equal(s.signedOut(), 1);
  assert.equal(pending.on, true);
});

test('no pending delete → no DELETE before signing out', async () => {
  const s = setup({ refreshOk: true, pending: flag(false), replies: [reply(401, {}), reply(401, {})] });
  await assert.rejects(s.call('GET', '/me'), isApiError(401, /sign in again/i));
  assert.equal(s.seen.length, 2);
});

test('422 with a FastAPI detail list shows the first message', async () => {
  const s = setup({ replies: [reply(422, { detail: [{ loc: ['body', 'tz'], msg: 'Unknown timezone', type: 'value_error' }] })] });
  await assert.rejects(s.call('PATCH', '/me', { tz: 'Mars/Base' }), isApiError(422, /Unknown timezone/));
});

test('404 says the item is gone', async () => {
  const s = setup({ replies: [reply(404, { detail: 'Not Found' })] });
  await assert.rejects(s.call('PATCH', '/goals/x', { status: 'done' }), isApiError(404, /no longer there/i));
});

test('5xx with a non-JSON body still gives an honest message', async () => {
  const s = setup({ replies: [new Response('Bad gateway', { status: 502 })] });
  await assert.rejects(s.call('GET', '/me'), isApiError(502, /our side \(502\)/));
});

test('429 rejects with a wait message and never signs out (index R9)', async () => {
  const s = setup({ replies: [reply(429, { detail: 'slow down' })] });
  await assert.rejects(s.call('GET', '/me'), isApiError(429, /too many/i));
  assert.equal(s.signedOut(), 0);
});

test('network failure → status 0, offline message', async () => {
  const s = setup({ replies: [new TypeError('Failed to fetch')] });
  await assert.rejects(s.call('GET', '/me'), isApiError(0, /can't reach/i));
});

test('timeout aborts the request → status 0, timeout message', async () => {
  const hang = (init) =>
    new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const s = setup({ replies: [hang], timeoutMs: 20 });
  await assert.rejects(s.call('GET', '/me'), isApiError(0, /too long/i));
});

test('errorText', () => {
  assert.equal(errorText(new ApiError(404, 'gone')), 'gone');
  assert.match(errorText('weird'), /something went wrong/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL. `http.test.mjs` reports `ERR_MODULE_NOT_FOUND` for `./http.ts`.

- [ ] **Step 3: Write the implementation**

`src/lib/http.ts`:

```ts
// C1 transport. Pure: fetch, token and session hooks are injected so `node --test` can drive it.

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export class ApiError extends Error {
  status: number; // 0 = never reached the server (offline / timeout)
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const MESSAGES = {
  offline: "Can't reach FocusGuard AI right now. Check your connection and try again.",
  timeout: 'FocusGuard AI took too long to answer. Try again in a moment.',
  signedOut: 'Your session ended. Please sign in again.',
  notFound: 'That item is no longer there.',
  tooMany: 'Too many requests. Wait a minute and try again.',
};

export function messageFor(status: number, detail: string): string {
  if (status === 404) return MESSAGES.notFound;
  if (status === 429) return MESSAGES.tooMany;
  if (status === 400 || status === 422)
    return detail ? `That didn't look right: ${detail}` : "That didn't look right. Check the value and try again.";
  return `Something went wrong on our side (${status}). Try again in a moment.`;
}

/** FastAPI `detail` is a string, or a list of {msg} for 422. */
function detailText(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0].msg === 'string') return detail[0].msg;
  return '';
}

export function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong. Try again in a moment.';
}

export type CallerDeps = {
  baseUrl: string; // e.g. "http://localhost:8000/api"
  // getToken/refresh may reject with an ApiError (offline refresh): it reaches the caller as-is, no sign-out.
  getToken: () => Promise<string | null>;
  refresh: () => Promise<boolean>; // true when a fresh token is now available
  onSignedOut: () => Promise<void> | void;
  pendingDelete?: { get: () => Promise<boolean>; clear: () => Promise<void> };
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function makeCaller(deps: CallerDeps) {
  const timeoutMs = deps.timeoutMs ?? 8000;

  // Index R9: a DELETE /me that ended in 502 leaves a server tombstone, so every other route now 401s for this
  // user while DELETE /me still accepts the token. Finish the deletion before the session is dropped.
  async function finishPendingDelete(): Promise<void> {
    try {
      if (!(await deps.pendingDelete?.get())) return;
      const token = await deps.getToken();
      if (token && (await request('DELETE', '/me', undefined, token)).status === 204) await deps.pendingDelete?.clear();
    } catch {
      // offline or no session: keep the flag for the next forced sign-out
    }
  }

  async function signedOut(): Promise<never> {
    await finishPendingDelete();
    await deps.onSignedOut();
    throw new ApiError(401, MESSAGES.signedOut);
  }

  async function send(method: Method, path: string, body: unknown): Promise<Response> {
    const token = await deps.getToken();
    if (!token) return signedOut();
    return request(method, path, body, token);
  }

  async function request(method: Method, path: string, body: unknown, token: string): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const f = deps.fetchImpl ?? fetch;
      return await f(`${deps.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch {
      throw new ApiError(0, ctrl.signal.aborted ? MESSAGES.timeout : MESSAGES.offline);
    } finally {
      clearTimeout(timer);
    }
  }

  return async function call<T>(method: Method, path: string, body?: unknown): Promise<T> {
    let res = await send(method, path, body);
    if (res.status === 401 && (await deps.refresh())) res = await send(method, path, body);
    if (res.status === 401) return signedOut();
    if (!res.ok) {
      let detail = '';
      try {
        detail = detailText((await res.json()).detail);
      } catch {
        // non-JSON error body: status-only message
      }
      throw new ApiError(res.status, messageFor(res.status, detail));
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, with all suites (day, lines, story, http) ok.

Run: `npx expo lint`
Expected: no errors. If `import/no-unresolved` fires on `./http.ts`, apply the Task 2 Step 5 disable comment.

- [ ] **Step 5: Report to lead**

Files: `src/lib/http.ts`, `src/lib/http.test.mjs`. Paste the `npm test` output.

---

### Task 6: Supabase session, C1 client, demo store

**Files:**
- Create: `src/lib/supabase.ts`
- Rewrite: `src/lib/api.ts`, `src/lib/mock.ts`
- Modify: `src/components/mode-pill.tsx:5`

**Interfaces:**
- Consumes: `makeCaller`, `ApiError`, `MESSAGES` (Task 5), C1 types (Task 3), `localDay`/`recentDays`/`deviceTz` (Task 2), `splitLines`/`MAX_LINES` (Task 2).
- Produces:
  - `src/lib/supabase.ts`: `DEMO: boolean`, `AUTH_CONFIGURED: boolean`, `supabase: SupabaseClient`, `useSession(): { loading: boolean; signedIn: boolean; email: string | null }`
  - `src/lib/api.ts`: `API_URL: string`, `sessionNotice: { ended: boolean }` (set when http's refresh-once fails, read by Sign in in Task 8), `pendingDelete: { get(): Promise<boolean>; set(): Promise<void>; clear(): Promise<void> }` (AsyncStorage key `fg.pendingDelete`, set by Settings in Task 10, finished by http's forced sign-out), and `api`, all methods `async`:
    - `me(): Promise<Profile>`
    - `patchMe(body: MePatch): Promise<Profile>`
    - `exportMe(): Promise<ExportBundle>`
    - `deleteMe(): Promise<void>`
    - `goals(day: string): Promise<Goal[]>`
    - `addGoals(lines: string, day: string): Promise<Goal[]>`
    - `patchGoal(id: string, patch: GoalPatch): Promise<Goal>`
    - `deleteGoal(id: string): Promise<void>`
    - `activeContext(): Promise<ContextSnap | null>`
    - `daily(from: string, to: string): Promise<DailyTotals[]>`
  - `src/lib/mock.ts`: `demo` with methods matching `api`. `exportAll()` backs `exportMe`.

- [ ] **Step 1: Re-read the docs for this task**

https://docs.expo.dev/guides/using-supabase/ (client options, AppState refresh, no URL polyfill), https://docs.expo.dev/guides/environment-variables/ (dot-notation reads).

- [ ] **Step 2: Supabase client + session hook**

`src/lib/supabase.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

// Dot-notation reads only: Expo inlines process.env.EXPO_PUBLIC_* at build time (v57 env-vars guide).
export const DEMO = process.env.EXPO_PUBLIC_DEMO_MODE === '1';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const AUTH_CONFIGURED = url !== '' && anonKey !== '';

// ponytail: placeholder URL/key only keep createClient from throwing when unconfigured;
// the Sign in screen shows AUTH_CONFIGURED=false instead of attempting a request.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'not-configured', {
  auth: {
    storage: AsyncStorage, // supports web + native (v57 async-storage page); no URL polyfill needed (v57 Supabase guide)
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web', // Google OAuth returns ?code= to the web origin; native has no URL
    flowType: 'pkce',
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Session for the auth gate. `loading` until supabase-js has read storage (INITIAL_SESSION). */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(DEMO ? null : undefined);
  useEffect(() => {
    if (DEMO) return;
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return {
    loading: session === undefined,
    signedIn: DEMO || session != null,
    email: session?.user.email ?? null,
  };
}
```

- [ ] **Step 3: Demo store shaped to C1**

Replace `src/lib/mock.ts` with:

```ts
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
```

- [ ] **Step 4: Typed C1 client**

Replace `src/lib/api.ts` with:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';

import { ApiError, MESSAGES, makeCaller } from '@/lib/http';
import { demo } from '@/lib/mock';
import { DEMO, supabase } from '@/lib/supabase';
import type { ContextSnap, DailyTotals, ExportBundle, Goal, GoalPatch, MePatch, Profile } from '@/lib/types';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Set when the session ended on its own (refresh did not work), so Sign in can say why the user is there. */
export const sessionNotice = { ended: false };

const PENDING_DELETE = 'fg.pendingDelete';
/** Set when DELETE /me ended in 502 or never answered (Task 10). http.ts finishes the delete on the next forced sign-out. */
export const pendingDelete = {
  get: async () => (await AsyncStorage.getItem(PENDING_DELETE).catch(() => null)) === '1',
  set: () => AsyncStorage.setItem(PENDING_DELETE, '1').catch(() => {}),
  clear: () => AsyncStorage.removeItem(PENDING_DELETE).catch(() => {}),
};

// A refresh that hit the network (offline, auth 5xx) returns an error but supabase-js keeps the stored
// session on purpose. Throwing here shows the offline message instead of signing the user out.
const offline = () => new ApiError(0, MESSAGES.offline);

const call = makeCaller({
  baseUrl: `${API_URL}/api`,
  // getSession() refreshes an expired access token before returning it (auth research §3.4).
  getToken: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error && isAuthRetryableFetchError(error)) throw offline();
    return data.session?.access_token ?? null;
  },
  refresh: async () => {
    const { error } = await supabase.auth.refreshSession();
    if (error && isAuthRetryableFetchError(error)) throw offline();
    return !error;
  },
  // Local scope: never revoke the extension's separate session (spec §3.1).
  onSignedOut: async () => {
    sessionNotice.ended = true; // the screen that caught the error unmounts; Sign in shows the notice instead
    await supabase.auth.signOut({ scope: 'local' });
  },
  pendingDelete,
});

const q = encodeURIComponent;

// Demo mode never touches the network; async wrappers turn demo throws into rejections.
export const api = {
  me: async () => {
    if (DEMO) return demo.me();
    const p = await call<Profile>('GET', '/me');
    // GET /me only succeeds when no deletion tombstone exists, so an old pending-delete flag is stale.
    await pendingDelete.clear();
    return p;
  },
  patchMe: async (body: MePatch) => (DEMO ? demo.patchMe(body) : call<Profile>('PATCH', '/me', body)),
  exportMe: async () => (DEMO ? demo.exportAll() : call<ExportBundle>('GET', '/me/export')),
  deleteMe: async () => (DEMO ? undefined : call<void>('DELETE', '/me')),

  goals: async (day: string) => (DEMO ? demo.goals(day) : call<Goal[]>('GET', `/goals?day=${q(day)}`)),
  addGoals: async (lines: string, day: string) =>
    DEMO ? demo.addGoals(lines, day) : call<Goal[]>('POST', '/goals', { lines, day }),
  patchGoal: async (id: string, patch: GoalPatch) =>
    DEMO ? demo.patchGoal(id, patch) : call<Goal>('PATCH', `/goals/${q(id)}`, patch),
  deleteGoal: async (id: string) => (DEMO ? demo.deleteGoal(id) : call<void>('DELETE', `/goals/${q(id)}`)),

  activeContext: async (): Promise<ContextSnap | null> =>
    DEMO ? demo.activeContext() : ((await call<ContextSnap[]>('GET', '/contexts?active=1'))[0] ?? null),

  daily: async (from: string, to: string) =>
    DEMO ? demo.daily(from, to) : call<DailyTotals[]>('GET', `/daily?from=${q(from)}&to=${q(to)}`),
};
```

- [ ] **Step 5: Point `ModePill` at the new types**

In `src/components/mode-pill.tsx`, replace:

```tsx
import type { Mode } from '@/lib/api';
```

with:

```tsx
import type { Mode } from '@/lib/types';
```

- [ ] **Step 6: Verify**

Run: `npm test`
Expected: PASS (unchanged).

Run: `npx tsc --noEmit`
Expected: errors **only** in `src/app/(tabs)/index.tsx`, because it still calls the old `api.getStats`, `api.extractGoals` and so on, and Task 7 replaces it. Any error in `src/lib/**` or `src/components/**` means stop and fix it.

- [ ] **Step 7: Report to lead**

Files: `src/lib/supabase.ts`, `src/lib/api.ts`, `src/lib/mock.ts`, `src/components/mode-pill.tsx`. Paste the `npm test` output and the `tsc` output, confirming errors are confined to `index.tsx`.

---

### Task 7: Today screen

**Files:**
- Create: `src/components/button.tsx`
- Rewrite: `src/app/(tabs)/index.tsx`
- Modify: `package.json`/`package-lock.json` (uninstall `expo-document-picker`)

**Interfaces:**
- Consumes: `api` (Task 6), `errorText` (Task 5), `storyFor` (Task 3), `localDay`, `recentDays`, `deviceTz` (Task 2), `splitLines`, `linesError`, `MAX_TITLE` (Task 2), the types (Task 3), and the existing `AppText`, `Card`, `EmptyState`, `Icon`, `ModePill`, `useDashboardLayout`, `Palette`, `cn`.
- Produces: `Button({ label, onPress, disabled?, tone?: 'primary' | 'quiet' | 'danger', accessibilityLabel?, className? })`, used by Tasks 8–10.

- [ ] **Step 1: Re-read the docs**

https://docs.expo.dev/versions/v57.0.0/sdk/router/: `useFocusEffect` (the callback must be wrapped in `useCallback`).

- [ ] **Step 2: Accessible button**

`src/components/button.tsx`:

```tsx
import { Pressable } from 'react-native';

import { AppText } from '@/components/app-text';
import { cn } from '@/theme/tailwind';

type Tone = 'primary' | 'quiet' | 'danger';

const BG: Record<Tone, string> = {
  primary: 'bg-primary',
  quiet: 'bg-surface-container-high',
  danger: 'bg-error',
};
const FG = { primary: 'on-primary', quiet: 'on-surface', danger: 'on-error' } as const;

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: Tone;
  accessibilityLabel?: string;
  className?: string;
};

/** 44 px minimum target, button role, disabled state announced. */
export function Button({ label, onPress, disabled = false, tone = 'primary', accessibilityLabel, className }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-[44px] px-lg rounded-full items-center justify-center active:opacity-85',
        disabled ? 'bg-surface-container-high opacity-60' : BG[tone],
        className,
      )}>
      <AppText variant="labelLg" color={disabled ? 'on-surface-variant' : FG[tone]}>
        {label}
      </AppText>
    </Pressable>
  );
}
```

- [ ] **Step 3: Today screen**

Replace `src/app/(tabs)/index.tsx` with:

```tsx
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { ModePill } from '@/components/mode-pill';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import { api } from '@/lib/api';
import { deviceTz, recentDays } from '@/lib/day';
import { errorText } from '@/lib/http';
import { MAX_TITLE, linesError, splitLines } from '@/lib/lines';
import { storyFor } from '@/lib/story';
import type { ContextSnap, ContextState, DailyTotals, Goal } from '@/lib/types';
import { Palette } from '@/theme';
import { cn } from '@/theme/tailwind';

const STATE_LABEL: Record<ContextState, string> = {
  detected: 'Just noticed',
  active: 'In focus',
  grace: 'On a short detour',
  intervened_l1: 'Checked in',
  escalated_l2: 'Checked in twice',
  on_break: 'On a break',
  ended: 'Wrapped up',
};

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function GoalRow({
  goal,
  onToggle,
  onRename,
  onDelete,
}: {
  goal: Goal;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal.title);
  const done = goal.status === 'done';

  // Only onBlur commits (single-line submit blurs), so one edit = one PATCH.
  const commit = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== goal.title && t.length <= MAX_TITLE) onRename(t);
    else setDraft(goal.title);
  };

  return (
    <View
      className={cn(
        'flex-row items-center gap-xs pr-xs rounded-[14px] border border-outline-variant/40 bg-surface-container-lowest min-h-[52px]',
        done && 'opacity-60',
      )}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${goal.title}: mark ${done ? 'not done' : 'done'}`}
        onPress={onToggle}
        className="w-11 h-11 items-center justify-center">
        <View
          className="w-7 h-7 rounded-full border-2 items-center justify-center"
          style={{ borderColor: done ? Palette.primary : Palette.outline, backgroundColor: done ? Palette.primary : 'transparent' }}>
          {done ? <Icon name="check" size={16} color={Palette.onPrimary} /> : null}
        </View>
      </Pressable>

      {editing ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          autoFocus
          maxLength={MAX_TITLE}
          returnKeyType="done"
          accessibilityLabel="Goal title"
          className="flex-1 min-h-[44px] font-body text-body-md text-on-surface"
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit goal: ${goal.title}`}
          onPress={() => {
            setDraft(goal.title);
            setEditing(true);
          }}
          className="flex-1 min-h-[44px] justify-center">
          <AppText variant="bodyMd" className={cn(done && 'line-through')}>
            {goal.title}
          </AppText>
        </Pressable>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete goal: ${goal.title}`}
        onPress={onDelete}
        className="w-11 h-11 items-center justify-center">
        <Icon name="close" size={18} color={Palette.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

function ContextCard({ ctx, everSynced }: { ctx: ContextSnap | null; everSynced: boolean }) {
  const heading = (
    <AppText variant="labelSm" color="on-surface-variant" className="uppercase tracking-[1.5px]">
      Current context
    </AppText>
  );
  if (!ctx && !everSynced) {
    return (
      <Card surface="surface-container-low" radius={24} className="p-lg gap-sm">
        {heading}
        {/* everSynced only looks back 7 days, so this copy must also read right for a returning user. */}
        <AppText variant="headlineMd">Nothing in progress</AppText>
        <AppText variant="bodyMd" color="on-surface-variant">
          Not seeing anything yet? Install the FocusGuard AI Chrome extension and sign in there with this same email.
          What you’re working on will show up here.
        </AppText>
      </Card>
    );
  }
  if (!ctx) {
    return (
      <Card surface="surface-container-low" radius={24} className="p-lg gap-sm">
        {heading}
        <AppText variant="bodyMd" color="on-surface-variant">
          Nothing in progress right now.
        </AppText>
      </Card>
    );
  }
  return (
    <Card radius={24} className="p-lg gap-sm">
      <View className="flex-row items-center justify-between">
        {heading}
        <AppText variant="labelSm" color="on-surface-variant">
          {STATE_LABEL[ctx.state]}
        </AppText>
      </View>
      <View className="flex-row items-center gap-sm">
        <AppText variant="headlineMd" className="flex-1">
          {ctx.title}
        </AppText>
        <ModePill mode={ctx.mode} />
      </View>
      {ctx.sites.length ? (
        <View className="flex-row flex-wrap gap-xs">
          {ctx.sites.slice(0, 5).map((site) => (
            <View key={site} className="px-sm py-xs rounded-full bg-surface-container-high">
              <AppText variant="labelSm" color="on-surface-variant">
                {site}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      <AppText variant="labelSm" color="on-surface-variant">
        Since {timeOf(ctx.started_at)} · last seen {timeOf(ctx.last_active_at)}
      </AppText>
    </Card>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { contentStyle, isDesktop } = useDashboardLayout();

  const [tz, setTz] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [ctx, setCtx] = useState<ContextSnap | null>(null);
  const [week, setWeek] = useState<DailyTotals[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api.me();
      const days = recentDays(7, new Date(), me.tz); // [0] = today in the profile tz
      const [gs, active, daily] = await Promise.all([api.goals(days[0]), api.activeContext(), api.daily(days[6], days[0])]);
      setTz(me.tz);
      setDay(days[0]);
      setGoals(gs);
      setCtx(active);
      setWeek(daily);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Writes update local state only after the server confirms.
  const write = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(`${errorText(e)} Nothing was saved.`);
    }
  };
  const replace = (updated: Goal) => setGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));

  const lines = splitLines(draft);
  const draftError = linesError(lines);
  const canAdd = day !== null && lines.length > 0 && draftError === null && !adding;

  const add = async () => {
    if (!day) return;
    setAdding(true);
    await write(async () => {
      const created = await api.addGoals(lines.join('\n'), day);
      setGoals((prev) => [...prev, ...created]);
      setDraft('');
    });
    setAdding(false);
  };

  const device = deviceTz();
  const done = goals.filter((g) => g.status === 'done').length;
  const todayTotals = week.find((d) => d.day === day) ?? null;
  const everSynced = ctx !== null || week.length > 0;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ ...contentStyle, paddingTop: isDesktop ? 36 : 12, paddingBottom: 40 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Palette.primary} />}
        showsVerticalScrollIndicator={false}>
        <View className="gap-xs">
          <AppText variant="headlineLgMobile" accessibilityRole="header">
            Today
          </AppText>
          <AppText variant="labelSm" color="on-surface-variant">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz ?? undefined })}
          </AppText>
          {tz && tz !== device ? (
            <AppText variant="labelSm" color="on-surface-variant">
              Your days follow {tz} time. You can change this in Settings.
            </AppText>
          ) : null}
        </View>

        {loading && day === null ? (
          <View className="items-center py-xl">
            <ActivityIndicator color={Palette.primary} accessibilityLabel="Loading today" />
          </View>
        ) : loadError ? (
          <EmptyState title="Can’t load today" subtitle={loadError} action={<Button label="Try again" onPress={load} />} />
        ) : (
          <>
            {actionError ? (
              <AppText variant="labelSm" color="error" accessibilityLiveRegion="polite">
                {actionError}
              </AppText>
            ) : null}

            <Card radius={24} className="p-lg gap-md">
              <View className="flex-row items-center justify-between">
                <AppText variant="headlineMd">Goals</AppText>
                {goals.length ? (
                  <AppText variant="labelSm" color="on-surface-variant">
                    {done} of {goals.length} done
                  </AppText>
                ) : null}
              </View>

              {goals.length === 0 ? (
                <AppText variant="bodyMd" color="on-surface-variant">
                  Nothing planned yet. What matters today?
                </AppText>
              ) : (
                <View className="gap-sm">
                  {goals.map((g) => (
                    <GoalRow
                      key={g.id}
                      goal={g}
                      onToggle={() => write(async () => replace(await api.patchGoal(g.id, { status: g.status === 'done' ? 'open' : 'done' })))}
                      onRename={(title) => write(async () => replace(await api.patchGoal(g.id, { title })))}
                      onDelete={() =>
                        write(async () => {
                          await api.deleteGoal(g.id);
                          setGoals((prev) => prev.filter((x) => x.id !== g.id));
                        })
                      }
                    />
                  ))}
                </View>
              )}

              <TextInput
                multiline
                value={draft}
                onChangeText={setDraft}
                placeholder={'One goal per line\nFinish the report\nReply to Sita'}
                placeholderTextColor={Palette.outline}
                textAlignVertical="top"
                accessibilityLabel="New goals, one per line"
                className="min-h-[96px] bg-surface-container-lowest border border-outline-variant rounded-[14px] px-md py-sm font-body text-body-md text-on-surface"
              />
              {draftError ? (
                <AppText variant="labelSm" color="error" accessibilityLiveRegion="polite">
                  {draftError}
                </AppText>
              ) : lines.length ? (
                <AppText variant="labelSm" color="on-surface-variant">
                  {lines.length === 1 ? 'Adds 1 goal.' : `Adds ${lines.length} goals.`}
                </AppText>
              ) : null}
              <Button label={adding ? 'Adding…' : 'Add goals'} disabled={!canAdd} onPress={add} className="self-start" />
            </Card>

            <ContextCard ctx={ctx} everSynced={everSynced} />

            <Card surface="surface-container-low" radius={24} className="p-lg gap-sm">
              <AppText variant="labelSm" color="on-surface-variant" className="uppercase tracking-[1.5px]">
                Today so far
              </AppText>
              <AppText variant="bodyLg">{storyFor(todayTotals)}</AppText>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 3b: Uninstall `expo-document-picker`**

Run: `grep -rn "expo-document-picker" src`
Expected: no output (the new `index.tsx` no longer imports it). If anything shows up, keep the package and note it in the report.

Run: `npm uninstall expo-document-picker`
Expected: gone from `package.json`. `app.json` `plugins` never listed it.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0. This is the first fully green type check since Task 5.

Run: `npx expo lint`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Smoke-check in demo mode**

Run (bash): `EXPO_PUBLIC_DEMO_MODE=1 npx expo start --web`
(PowerShell: `$env:EXPO_PUBLIC_DEMO_MODE='1'; npx expo start --web`)

Expected in the browser at the URL printed (default http://localhost:8081):
- Today shows 3 goals, "1 of 3 done", the context card "Landing page redesign", and the story starting "A smooth day."
- Typing two lines shows "Adds 2 goals.", and Add appends them.
- A tick toggles the strike-through, tapping a title edits it, and blurring the input saves.
- × deletes.
- Pasting 21 lines shows the "Add up to 20" error and disables Add.

Stop the server (Ctrl+C).

- [ ] **Step 6: Report to lead**

Files: `src/components/button.tsx`, `src/app/(tabs)/index.tsx`, `package.json`, `package-lock.json`. Paste the Step 3b grep output, the tsc, lint and test output, and the smoke-check notes.

---

### Task 8: Auth gate and Sign in

**Files:**
- Rewrite: `src/app/_layout.tsx`
- Create: `src/app/sign-in.tsx`

**Interfaces:**
- Consumes: `useSession`, `supabase`, `AUTH_CONFIGURED`, `sessionNotice` (Task 6), `MESSAGES` (Task 5), `Button` (Task 7), and the existing `AppText`, `Card`, `MascotAvatar`, `Palette`.
- Produces: signed-out users only see `/sign-in`, and signed-in users (or DEMO) only see `(tabs)`. A web deep link to `/settings` or `/history` (index R30: the extension links to `${DASHBOARD_URL}/settings`) survives the email-code sign-in. Sign in shows `MESSAGES.signedOut` after the session ended on its own.

- [ ] **Step 1: Re-read the docs**

https://docs.expo.dev/router/advanced/protected/: `Stack.Protected guard`. A false guard redirects to the first available screen. `redirectTo` is SDK 58+, so don't use it.

- [ ] **Step 2: Root layout with the guard**

Replace `src/app/_layout.tsx` with:

```tsx
import { DefaultTheme, Stack, ThemeProvider, useRouter, type Href } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import '@/global.css';

import { useSession } from '@/lib/supabase';
import { Palette } from '@/theme';

SplashScreen.preventAutoHideAsync();

// Index R30: the extension links to ${DASHBOARD_URL}/settings. A signed-out visitor is redirected to
// sign-in, and the guard flip would land them on Today, so remember the requested tab from the URL
// the page was opened with and go there once signed in.
// ponytail: module memory only, so the Google redirect (full page reload to the origin) lands on Today;
// move it to sessionStorage if that path matters.
const DEEP_LINKS = ['/history', '/settings'];
let pendingPath: string | null =
  Platform.OS === 'web' && DEEP_LINKS.includes(window.location.pathname) ? window.location.pathname : null;

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_700Bold: require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
    PlusJakartaSans_800ExtraBold: require('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'),
    BeVietnamPro_400Regular: require('@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf'),
    BeVietnamPro_500Medium: require('@expo-google-fonts/be-vietnam-pro/500Medium/BeVietnamPro_500Medium.ttf'),
    BeVietnamPro_600SemiBold: require('@expo-google-fonts/be-vietnam-pro/600SemiBold/BeVietnamPro_600SemiBold.ttf'),
    BeVietnamPro_700Bold: require('@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf'),
  });
  const { loading, signedIn } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (fontsLoaded && !loading) SplashScreen.hideAsync();
  }, [fontsLoaded, loading]);

  // Runs after the commit that rendered the Stack with the signed-in guard, so the navigator is mounted.
  useEffect(() => {
    if (!fontsLoaded || loading || !signedIn || !pendingPath) return;
    const to = pendingPath;
    pendingPath = null;
    router.replace(to as Href);
  }, [fontsLoaded, loading, signedIn, router]);

  if (!fontsLoaded || loading) return null;

  const routerTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: Palette.primary,
      background: Palette.background,
      card: Palette.surface,
      text: Palette.onSurface,
      border: Palette.outlineVariant,
      notification: Palette.primary,
    },
  };

  // Client-side gate only (v57 protected-routes page); the backend verifies every token itself.
  return (
    <ThemeProvider value={routerTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: Sign in screen**

`src/app/sign-in.tsx`:

```tsx
import { useState } from 'react';
import { Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { MascotAvatar } from '@/components/mascot';
import { sessionNotice } from '@/lib/api';
import { MESSAGES } from '@/lib/http';
import { AUTH_CONFIGURED, supabase } from '@/lib/supabase';
import { Palette } from '@/theme';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const CODE_RE = /^\d{6}$/;
const INPUT =
  'min-h-[48px] bg-surface-container-lowest border border-outline-variant rounded-[14px] px-md font-body text-body-md text-on-surface';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  // Pure initializer (no clearing here: dev StrictMode may call it twice). The flag clears on the next action.
  const [error, setError] = useState<string | null>(() => (sessionNotice.ended ? MESSAGES.signedOut : null));

  const addr = email.trim();

  // Supabase returns {error} for auth failures (bad code, rate limit) and throws only on transport failure.
  const run = async (fn: () => Promise<{ error: { message: string } | null }>, onOk?: () => void) => {
    setBusy(true);
    setError(null);
    sessionNotice.ended = false;
    try {
      const { error: err } = await fn();
      if (err) setError(err.message);
      else onOk?.();
    } catch {
      setError("Can't reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => run(() => supabase.auth.signInWithOtp({ email: addr }), () => setSent(true));
  // On success onAuthStateChange flips the root guard; nothing else to do here.
  const verify = () => run(() => supabase.auth.verifyOtp({ email: addr, token: code, type: 'email' }));
  const google = () =>
    run(() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }));

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 40 + insets.bottom }}>
      <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }} className="gap-lg">
        <View className="items-center gap-sm">
          <MascotAvatar size={56} />
          <AppText variant="headlineMd" accessibilityRole="header">
            Sign in to FocusGuard AI
          </AppText>
          <AppText variant="bodyMd" color="on-surface-variant" className="text-center">
            Use the same email as the Chrome extension so your goals and days line up.
          </AppText>
        </View>

        {!AUTH_CONFIGURED ? (
          <Card surface="error-container" radius={20} className="p-md">
            <AppText variant="bodyMd" color="on-error-container">
              Sign-in isn’t set up yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env (or set
              EXPO_PUBLIC_DEMO_MODE=1) and restart.
            </AppText>
          </Card>
        ) : null}

        <Card radius={24} className="p-lg gap-md">
          {!sent ? (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Palette.outline}
                keyboardType="email-address"
                inputMode="email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                accessibilityLabel="Email address"
                className={INPUT}
              />
              <Button
                label={busy ? 'Sending…' : 'Email me a code'}
                disabled={busy || !AUTH_CONFIGURED || !EMAIL_RE.test(addr)}
                onPress={sendCode}
              />
            </>
          ) : (
            <>
              <AppText variant="bodyMd">Enter the 6-digit code we sent to {addr}.</AppText>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                placeholderTextColor={Palette.outline}
                keyboardType="number-pad"
                inputMode="numeric"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                accessibilityLabel="6-digit code"
                className={INPUT}
              />
              <Button label={busy ? 'Checking…' : 'Sign in'} disabled={busy || !CODE_RE.test(code)} onPress={verify} />
              <View className="flex-row gap-sm flex-wrap">
                <Button tone="quiet" label="Send a new code" disabled={busy} onPress={sendCode} />
                <Button
                  tone="quiet"
                  label="Use a different email"
                  disabled={busy}
                  onPress={() => {
                    setSent(false);
                    setCode('');
                    setError(null);
                  }}
                />
              </View>
            </>
          )}
          {error ? (
            <AppText variant="labelSm" color="error" accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
        </Card>

        {Platform.OS === 'web' ? (
          <Button tone="quiet" label="Continue with Google" disabled={busy || !AUTH_CONFIGURED} onPress={google} />
        ) : null}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx expo lint`
Expected: no errors.

- [ ] **Step 5: Smoke-check both gates**

1. Run (bash): `EXPO_PUBLIC_DEMO_MODE=1 npx expo start --web`. Expected: lands straight on Today, with no Sign in. Stop the server.
2. Run with `EXPO_PUBLIC_DEMO_MODE=0` and no Supabase vars in `.env`, i.e. bash `EXPO_PUBLIC_DEMO_MODE=0 EXPO_PUBLIC_SUPABASE_URL= EXPO_PUBLIC_SUPABASE_ANON_KEY= npx expo start --web`. Expected: `/` shows Sign in with the "Sign-in isn’t set up yet" card. "Email me a code" stays disabled. Stop the server. (`/history` and `/settings` don't exist until Tasks 9 and 10, which check them signed out.)
3. If the lead has provided real Supabase test-project values in `.env`, sign in with a test inbox the lead names. Expected: the code arrives, and entering it lands on Today. Skip this step otherwise and say so in the report.

- [ ] **Step 6: Report to lead**

Files: `src/app/_layout.tsx`, `src/app/sign-in.tsx`. Paste the tsc and lint output and the smoke-check results.

---

### Task 9: History

**Files:**
- Create: `src/app/(tabs)/history.tsx`
- Modify: `src/app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `api.me`, `api.daily` (Task 6), `recentDays`, `dayLabel` (Task 2), `storyFor`, `fmtDuration` (Task 3), `errorText` (Task 5), `Button` (Task 7).
- Produces: the `history` tab route.

- [ ] **Step 1: History screen**

`src/app/(tabs)/history.tsx`:

```tsx
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import { api } from '@/lib/api';
import { dayLabel, recentDays } from '@/lib/day';
import { errorText } from '@/lib/http';
import { fmtDuration, storyFor } from '@/lib/story';
import type { DailyTotals } from '@/lib/types';
import { Palette } from '@/theme';

function Totals({ t }: { t: DailyTotals }) {
  const rows: [string, string][] = [
    ['Focus time', fmtDuration(t.focus_s)],
    ['Check-ins', String(t.nudges)],
    ['Came back on your own', String(t.self_returns)],
    ['Times you got back on track', String(t.recoveries)],
    ['Extra time taken', String(t.snoozes)],
    ['Breaks', String(t.breaks)],
    ['Longest detour', t.longest_detour_s ? fmtDuration(t.longest_detour_s) : 'none'],
  ];
  return (
    <View className="gap-xs pt-sm border-t border-outline-variant/40">
      {rows.map(([label, value]) => (
        <View key={label} className="flex-row justify-between">
          <AppText variant="labelSm" color="on-surface-variant">
            {label}
          </AppText>
          <AppText variant="labelSm">{value}</AppText>
        </View>
      ))}
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { contentStyle, isDesktop } = useDashboardLayout();
  const [days, setDays] = useState<string[]>([]);
  const [byDay, setByDay] = useState<Record<string, DailyTotals>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api.me();
      const ds = recentDays(7, new Date(), me.tz);
      const rows = await api.daily(ds[6], ds[0]);
      setDays(ds);
      setByDay(Object.fromEntries(rows.map((r) => [r.day, r])));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ ...contentStyle, paddingTop: isDesktop ? 36 : 12, paddingBottom: 40 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Palette.primary} />}
        showsVerticalScrollIndicator={false}>
        <AppText variant="headlineLgMobile" accessibilityRole="header">
          Last 7 days
        </AppText>

        {loading && days.length === 0 ? (
          <View className="items-center py-xl">
            <ActivityIndicator color={Palette.primary} accessibilityLabel="Loading history" />
          </View>
        ) : error ? (
          <EmptyState title="Can’t load your history" subtitle={error} action={<Button label="Try again" onPress={load} />} />
        ) : (
          <View className="gap-sm">
            {days.map((day, i) => {
              const t = byDay[day] ?? null;
              const name = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : dayLabel(day);
              const story = storyFor(t);
              const expanded = open === day;
              return (
                <Card key={day} radius={20} shadow={false} className="px-md py-sm">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${name}. ${story}${t ? (expanded ? ' Hide totals.' : ' Show totals.') : ''}`}
                    accessibilityState={{ expanded, disabled: !t }}
                    disabled={!t}
                    onPress={() => setOpen(expanded ? null : day)}
                    className="min-h-[44px] flex-row items-start gap-sm">
                    <View className="flex-1 gap-[2px]">
                      <AppText variant="labelLg">{name}</AppText>
                      <AppText variant="bodyMd" color={t ? 'on-surface' : 'on-surface-variant'}>
                        {story}
                      </AppText>
                    </View>
                    {t ? <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={Palette.onSurfaceVariant} /> : null}
                  </Pressable>
                  {expanded && t ? <Totals t={t} /> : null}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 2: Register the tab**

In `src/app/(tabs)/_layout.tsx`, replace:

```tsx
      <Tabs.Screen name="index" />
```

with:

```tsx
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx expo lint`
Expected: no errors.

Smoke (demo mode, as in Task 7 Step 5): the History tab shows 7 rows (Today, Yesterday, then weekday names). Yesterday reads "A bumpy day, and that's okay. …". The third row reads "Nothing recorded for this day." and can't be tapped. Tapping a filled row shows its 7 totals.

Smoke (signed out): with `EXPO_PUBLIC_DEMO_MODE=0` and empty Supabase vars (as in Task 8 Step 5 item 2), visiting `/history` lands on Sign in. Stop the server.

- [ ] **Step 4: Report to lead**

Files: `src/app/(tabs)/history.tsx`, `src/app/(tabs)/_layout.tsx`. Paste the output and the smoke notes.

---

### Task 10: Settings

**Files:**
- Create: `src/app/(tabs)/settings.tsx`
- Modify: `src/app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `api.me`, `api.patchMe`, `api.exportMe`, `api.deleteMe`, `pendingDelete` (Task 6), `DEMO`, `supabase`, `useSession` (Task 6), `deviceTz`, `localDay`, `quietHoursError` (Task 2), `ApiError`, `errorText` (Task 5), `Button` (Task 7), types `MePatch`, `Profile`, `QuietRange`, `Settings`.
- Produces: the `settings` tab route.

- [ ] **Step 1: Settings screen**

`src/app/(tabs)/settings.tsx`:

```tsx
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import { api, pendingDelete } from '@/lib/api';
import { deviceTz, localDay, quietHoursError } from '@/lib/day';
import { ApiError, errorText } from '@/lib/http';
import { DEMO, supabase, useSession } from '@/lib/supabase';
import type { MePatch, Profile, QuietRange, Settings } from '@/lib/types';
import { Palette } from '@/theme';
import { cn } from '@/theme/tailwind';

const GRACE_CHOICES = [120, 300, 600];
const INPUT =
  'min-h-[44px] bg-surface-container-lowest border border-outline-variant rounded-[12px] px-sm font-body text-body-md text-on-surface';

type SectionKey = 'account' | 'grace' | 'quiet' | 'tz' | 'data' | 'delete';
type Status = { key: SectionKey; text: string; error: boolean } | null;

function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <View className={cn('rounded-[24px] border bg-surface p-md gap-sm', danger ? 'border-error-container' : 'border-outline-variant/40')}>
      <AppText variant="labelSm" color="on-surface-variant" className="uppercase tracking-[1.5px]" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { contentStyle, isDesktop } = useDashboardLayout();
  const { email } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ranges, setRanges] = useState<QuietRange[]>([]);
  const [tzDraft, setTzDraft] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api.me();
      setProfile(p);
      setRanges(p.settings.quiet_hours ?? []);
      setTzDraft(p.tz);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const note = (key: SectionKey) =>
    status?.key === key ? (
      <AppText variant="labelSm" color={status.error ? 'error' : 'primary'} accessibilityLiveRegion="polite">
        {status.text}
      </AppText>
    ) : null;

  const save = async (key: SectionKey, body: MePatch, okText: string) => {
    setBusy(true);
    setStatus(null);
    try {
      setProfile(await api.patchMe(body));
      setStatus({ key, text: okText, error: false });
    } catch (e) {
      setStatus({ key, text: `${errorText(e)} Nothing was saved.`, error: true });
    } finally {
      setBusy(false);
    }
  };

  // Send only the changed key. PATCH /me merges settings top-level (index R4), so re-sending a stale
  // copy of the other keys would revert a change made in the extension popup meanwhile.
  const saveSettings = (key: SectionKey, patch: Settings, okText: string) =>
    profile ? save(key, { settings: patch }, okText) : undefined;

  const exportData = async () => {
    if (!profile) return;
    setBusy(true);
    setStatus(null);
    try {
      const data = await api.exportMe();
      const href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = href;
      a.download = `focusguard-export-${localDay(new Date(), profile.tz)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setStatus({ key: 'data', text: 'Your export is downloading.', error: false });
    } catch (e) {
      setStatus({ key: 'data', text: errorText(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (DEMO) {
      setStatus({ key: 'delete', text: 'Demo mode keeps nothing on a server, so there is nothing to delete.', error: false });
      return;
    }
    setBusy(true);
    setStatus(null);
    // Index R9: 502 = rows deleted, auth-user removal did not finish; a retry returns 204.
    // Status 0 = timeout/offline: the server may have finished after we gave up. Retrying is safe either way.
    let failure: unknown = null;
    for (const wait of [0, 1000, 3000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        await api.deleteMe();
        await pendingDelete.clear();
        await supabase.auth.signOut({ scope: 'local' }); // the auth gate then shows Sign in
        return;
      } catch (e) {
        failure = e;
        const s = e instanceof ApiError ? e.status : -1;
        if (s !== 502 && s !== 0) break; // anything else will not get better by retrying
      }
    }
    const s = failure instanceof ApiError ? failure.status : -1;
    // After a 502 every other route 401s for this user (server tombstone), so leaving Settings would sign them
    // out. The flag makes http.ts send DELETE /me before any forced sign-out, so the deletion still finishes.
    if (s === 502 || s === 0) await pendingDelete.set();
    // `confirm` is left as typed, so the button stays enabled for a manual retry.
    const text =
      s === 502
        ? "Your data is deleted, but removing your sign-in didn't finish. Press Delete my account again, or FocusGuard AI will finish it the next time you're signed in here."
        : s === 0
          ? `${errorText(failure)} Deletion may have finished. Press Delete my account again to make sure.`
          : `${errorText(failure)} Your account was not deleted.`;
    setStatus({ key: 'delete', text, error: true });
    setBusy(false);
  };

  const signOut = async () => {
    setBusy(true);
    // Local scope: signing out here must not sign the extension out (separate sessions, spec §3.1).
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      setStatus({ key: 'account', text: error.message, error: true });
      setBusy(false);
    }
  };

  const device = deviceTz();
  const grace = profile?.settings.grace_s ?? 300;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ ...contentStyle, paddingTop: isDesktop ? 36 : 12, paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}>
        <AppText variant="headlineLgMobile" accessibilityRole="header">
          Settings
        </AppText>

        {loadError ? (
          <EmptyState title="Can’t load your settings" subtitle={loadError} action={<Button label="Try again" onPress={load} />} />
        ) : !profile ? (
          <View className="items-center py-xl">
            <ActivityIndicator color={Palette.primary} accessibilityLabel="Loading settings" />
          </View>
        ) : (
          <>
            <Section title="Account">
              <AppText variant="bodyMd">{DEMO ? 'Demo mode: nothing leaves this browser.' : `Signed in as ${email ?? 'unknown'}`}</AppText>
              {!DEMO ? <Button tone="quiet" label="Sign out" disabled={busy} onPress={signOut} className="self-start" /> : null}
              {note('account')}
            </Section>

            <Section title="Grace before a check-in">
              <AppText variant="bodyMd" color="on-surface-variant">
                How long FocusGuard AI waits after you drift before checking in.
              </AppText>
              <View accessibilityRole="radiogroup" className="flex-row gap-sm flex-wrap">
                {GRACE_CHOICES.map((s) => {
                  const on = grace === s;
                  return (
                    <Pressable
                      key={s}
                      accessibilityRole="radio"
                      accessibilityLabel={`${s / 60} minutes`}
                      accessibilityState={{ checked: on, disabled: busy }}
                      disabled={busy}
                      onPress={() => saveSettings('grace', { grace_s: s }, `Grace set to ${s / 60} minutes.`)}
                      className={cn(
                        'min-h-[44px] min-w-[72px] px-md rounded-full border items-center justify-center',
                        on ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-container-low',
                      )}>
                      <AppText variant="labelLg" color={on ? 'primary' : 'on-surface-variant'}>
                        {s / 60} min
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              {!GRACE_CHOICES.includes(grace) ? (
                <AppText variant="labelSm" color="on-surface-variant">
                  Currently {Math.round(grace / 60)} min.
                </AppText>
              ) : null}
              {note('grace')}
            </Section>

            <Section title="Quiet hours">
              <AppText variant="bodyMd" color="on-surface-variant">
                No check-ins during these times. 24-hour time; overnight is fine (22:00 to 07:00).
              </AppText>
              {ranges.map((r, i) => (
                <View key={i} className="flex-row items-center gap-sm">
                  <TextInput
                    value={r.from}
                    onChangeText={(v) => setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, from: v } : x)))}
                    placeholder="22:00"
                    placeholderTextColor={Palette.outline}
                    maxLength={5}
                    accessibilityLabel={`Quiet period ${i + 1} start, 24-hour time`}
                    className={cn(INPUT, 'w-[88px]')}
                  />
                  <AppText variant="bodyMd">to</AppText>
                  <TextInput
                    value={r.to}
                    onChangeText={(v) => setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, to: v } : x)))}
                    placeholder="07:00"
                    placeholderTextColor={Palette.outline}
                    maxLength={5}
                    accessibilityLabel={`Quiet period ${i + 1} end, 24-hour time`}
                    className={cn(INPUT, 'w-[88px]')}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove quiet period ${i + 1}`}
                    onPress={() => setRanges((rs) => rs.filter((_, j) => j !== i))}
                    className="w-11 h-11 items-center justify-center">
                    <Icon name="close" size={18} color={Palette.onSurfaceVariant} />
                  </Pressable>
                </View>
              ))}
              <View className="flex-row gap-sm flex-wrap">
                <Button
                  tone="quiet"
                  label="Add a quiet period"
                  disabled={ranges.length >= 3}
                  onPress={() => setRanges((rs) => [...rs, { from: '22:00', to: '07:00' }])}
                />
                <Button
                  label="Save quiet hours"
                  disabled={busy}
                  onPress={() => {
                    const err = quietHoursError(ranges);
                    if (err) setStatus({ key: 'quiet', text: err, error: true });
                    else saveSettings('quiet', { quiet_hours: ranges }, 'Quiet hours saved.');
                  }}
                />
              </View>
              {note('quiet')}
            </Section>

            <Section title="Timezone">
              <AppText variant="bodyMd" color="on-surface-variant">
                Your days (goals and totals) start at midnight in this timezone.
              </AppText>
              <TextInput
                value={tzDraft}
                onChangeText={setTzDraft}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Asia/Kathmandu"
                placeholderTextColor={Palette.outline}
                accessibilityLabel="Timezone, for example Asia/Kathmandu"
                className={INPUT}
              />
              <View className="flex-row gap-sm flex-wrap">
                {tzDraft.trim() !== device ? (
                  <Button tone="quiet" label={`Use this device’s (${device})`} onPress={() => setTzDraft(device)} />
                ) : null}
                <Button
                  label="Save timezone"
                  disabled={busy || !tzDraft.trim() || tzDraft.trim() === profile.tz}
                  onPress={() => save('tz', { tz: tzDraft.trim() }, 'Timezone saved.')}
                />
              </View>
              {note('tz')}
            </Section>

            <Section title="Your data">
              <AppText variant="bodyMd" color="on-surface-variant">
                The server keeps your goals, context names and modes, site names (like github.com), settings and daily
                totals. Page titles, full addresses and AI keys stay in your browser.
              </AppText>
              <Button
                tone="quiet"
                label="Export my data"
                accessibilityLabel="Export my data as a JSON file"
                disabled={busy || Platform.OS !== 'web'}
                onPress={exportData}
                className="self-start"
              />
              {Platform.OS !== 'web' ? (
                <AppText variant="labelSm" color="on-surface-variant">
                  Export works from the web dashboard.
                </AppText>
              ) : null}
              {note('data')}
            </Section>

            <Section title="Delete my account" danger>
              <AppText variant="bodyMd">
                This permanently deletes your goals, contexts, daily totals, settings and sign-in. It can’t be undone. The
                Chrome extension keeps its own local data until you sign out there or remove it.
              </AppText>
              <AppText variant="labelSm" color="on-surface-variant">
                Type DELETE to confirm.
              </AppText>
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel="Type DELETE to confirm account deletion"
                className={INPUT}
              />
              <Button
                tone="danger"
                label="Delete my account"
                disabled={busy || confirm !== 'DELETE'}
                onPress={deleteAccount}
                className="self-start"
              />
              {note('delete')}
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 2: Register the tab**

In `src/app/(tabs)/_layout.tsx`, replace:

```tsx
      <Tabs.Screen name="history" />
```

with:

```tsx
      <Tabs.Screen name="history" />
      <Tabs.Screen name="settings" />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx expo lint`
Expected: no errors.

Smoke (demo mode):
- The 5 min chip is selected. Tapping 2 min shows "Grace set to 2 minutes." and moves the selection.
- Quiet hours shows 22:00 to 07:00. Changing it to `9:00` and saving shows the "24-hour time" error. Adding 3 periods disables "Add a quiet period".
- Timezone shows the device tz and saves.
- Export downloads `focusguard-export-YYYY-MM-DD.json` containing `profile`, `goals`, `contexts` and `daily`.
- The Delete button stays disabled until `DELETE` is typed exactly. Pressing it then shows the demo note.

Smoke (signed out): with `EXPO_PUBLIC_DEMO_MODE=0` and empty Supabase vars (as in Task 8 Step 5 item 2), visiting `/settings` lands on Sign in. Stop the server.

- [ ] **Step 4: Report to lead**

Files: `src/app/(tabs)/settings.tsx`, `src/app/(tabs)/_layout.tsx`. Paste the output and the smoke notes.

---

### Task 11: Whole-stream verification

**Files:** none new. Fixes only, inside owned paths.

**Interfaces:**
- Consumes: everything above.
- Produces: a stream ready for the lead to integrate against stream B.

- [ ] **Step 1: Unit tests**

Run: `npm test`
Expected: all suites (`day`, `lines`, `story`, `http`) pass, with 0 failures.

- [ ] **Step 2: Types and lint**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx expo lint`
Expected: no errors.

- [ ] **Step 3: Web export (production and demo)**

Run (bash): `npx expo export --platform web`
Expected: finishes with `Exported: dist` and creates `dist/index.html` (a single file, because `web.output` is `"single"`).

Run (bash): `EXPO_PUBLIC_DEMO_MODE=1 npx expo export --platform web --output-dir dist-demo`
Expected: the same success. Then delete it: `rm -rf dist-demo`.

- [ ] **Step 4: No leftovers from the hackathon API, no banned words, every Pressable labelled, R39 product name**

Run:

```bash
grep -rnE "/api/(planning|stats|sessions|insights|interventions|break|mood|beast|achievements)|parseServerUtc|ngrok-skip" src
grep -rniE "lazy|failed|wasted|distracted again|you should have|disappointing" src --include=*.tsx --include=*.ts
grep -rn "<Pressable" src | wc -l
grep -rn "accessibilityRole=" src | wc -l
grep -n '"name": "FocusGuard AI"' app.json
grep -rn "FocusGuard" src | grep -v "FocusGuard AI"
```

Expected:
- The first grep prints nothing.
- The second prints only `src/lib/story.ts` (the `BANNED_WORDS` list itself).
- The third count is ≤ the fourth (the extra roles come from `View`/`AppText` headers and lists).
- The fifth prints the `web.name` line (the index R39 page title).
- The sixth prints no user-visible string literal. Code identifiers and comments can stay as they are, but any copy that names the product must read "FocusGuard AI" (R39).

If a `Pressable` lacks a role, add `accessibilityRole="button"` and an `accessibilityLabel`.

- [ ] **Step 5: Full demo walk-through**

Run (bash): `EXPO_PUBLIC_DEMO_MODE=1 npx expo start --web`
Walk through Today (add, tick, edit, delete), History (expand a day) and Settings (each section), first at the desktop width and then at 375 px wide using the browser's device toolbar. Expected: no red-box errors, no horizontal scroll at 375 px, and every control reachable with Tab and activated with Enter/Space on web. Stop the server.

If the lead has provided real Supabase test-project values in `.env` (as in Task 8 Step 5), also run without demo mode: sign out, open `http://localhost:8081/settings` directly, and sign in with the email code. Expected: you land on Settings, not Today (index R30 deep link). Skip this otherwise and say so in the report.

- [ ] **Step 6: Report to lead**

Paste the output of Steps 1–4 and the walk-through notes. Also hand over the deployment prerequisites below (lead-owned, outside this stream):
- Supabase **Email OTP** template must contain `{{ .Token }}` so a 6-digit code is sent, not only a link.
- Supabase **Google** provider is enabled, and every dashboard origin (dev `http://localhost:8081` and prod) is in Auth → URL Configuration → Redirect URLs.
- Backend `CORS` allows those dashboard origins (stream B env).
- SPA hosting must rewrite every path to `/index.html` (deep links like `/history`).
- README runbook: the four `EXPO_PUBLIC_*` vars.

---

## Self-review

1. **Spec coverage (§5, §3.1, §6, §7):**
   - Sign in by email code: Task 8. Google on web: Task 8.
   - Tabs reduced to Today/History/Settings and old screens deleted: Task 4, with tabs added in Tasks 9 and 10.
   - Today: goals with multi-line add, tick, edit and delete; context card with the extension CTA; story. All in Task 7.
   - History, 7 days with tap for totals: Task 9.
   - Settings: grace, quiet hours, timezone, export, typed delete, sign out. All in Task 10.
   - Honest empty and offline states via `EmptyState` + `errorText`: Tasks 7, 9 and 10.
   - Accessibility: covered in Tasks 4, 7–10 and checked in Task 11.
   - Demo mode: Task 6.
   - Tests: Tasks 2, 3 and 5, with tsc, lint and export in Task 11.
   - §6: 401 → refresh once → signed out (Task 5); 422/404 messages (Task 5).
   - Index resolutions owned here: R30 `@types/chrome` in root devDependencies (Task 1 Step 3b) and the `/settings` deep link surviving sign-in (Task 8); R4 settings PATCH sends only the changed key (Task 10); R9 429 never signs out (Task 5 test); a 502 or timeout from `DELETE /me` is retried twice automatically, then says the data may already be gone and to press Delete again, and sets `pendingDelete` so the forced sign-out caused by the server tombstone sends `DELETE /me` first (Tasks 5, 6 and 10); R3 newline-only split (Task 2; matches B's `split_lines`); R39 product name "FocusGuard AI" in the page title and all user-visible copy (Tasks 1, 3, 4, 5, 7, 8, 10; checked in Task 11).
   - Dependency removals never break a verify step: `expo-notifications` goes in Task 4, `expo-document-picker` only after Task 7 replaces its last importer.
   - Mobile native: compiles via tsc. Google is hidden off-web and export is web-only, both stated in the UI.
2. **Placeholder scan:** every code step has complete code, and every "if X" branch gives the exact fix.
3. **Type consistency:**
   - `api.*` names match between Tasks 6, 7, 9 and 10.
   - `Button` props match between Tasks 7, 8, 9 and 10.
   - `quietHoursError(ranges: {from,to}[])` takes `QuietRange[]`.
   - `recentDays(...)[0]` is today everywhere.
   - `storyFor` accepts `null`.
   - `TAB_ROUTES` names equal the route files.
4. **Review Focus:** each of the five lines has its test in Task 2, 3 or 5.
