# Chrome Web Store listing — DRAFT

> Product name pending (`docs/PENDING_DECISIONS.md` #1). Keep every claim literally true; reviewers compare the listing, the privacy policy and the code.

## Single purpose (dashboard field)

Helps you return to the task you were working on: it notices when you drift away from your current task in the browser, waits a grace period, gives a gentle reminder, and brings you back to the exact tab or reopens your task's tabs after a break.

## Short description (≤132 chars)

Gently brings you back to what you were working on — notices drift, waits before nudging, and restores your tabs after breaks.

## Long description

Lose your place every time you get distracted? FocusGuard remembers it for you.

• It figures out what you're working on (like "Landing page design") and keeps those tabs together in a tab group.
• Wander off to YouTube or Reddit? Nothing happens right away — you get a grace period. Come back on your own and it stays quiet.
• Still away after a while? A small, friendly card in the corner — never a full-screen block. Back · "This is related" · 5 more minutes · Take a break.
• Taking a break? Leave yourself a one-line note. When you return, you see your note and one click reopens your tabs.
• A web dashboard shows your goals for the day and a short, kind summary — no scores, no guilt.
• Optional Beast Mode blocks the sites you pick, only when you turn it on.

Privacy: your browsing activity never leaves your browser. Our server only stores your goals, the names of your contexts with their site names, your settings and daily totals. Banking, health, password-manager, messaging and government sites are never observed, and neither are incognito windows. AI is optional and off by default — use Chrome's on-device AI, a local model, or your own API key.

No ads. No tracking. Free.

## Permission justifications

| Permission | Justification |
|---|---|
| `tabs` | Read the active tab's site name and title to understand what the user is working on and detect drift; focus or reopen the user's task tabs. Titles and URLs are processed locally and never sent to our server. |
| `storage` | Store the user's current task, resume targets, settings and sign-in session locally. |
| `alarms` | Run the grace-period and reminder timers reliably in the MV3 service worker. |
| `idle` | Avoid reminding the user while they are away from the computer or the screen is locked. |
| `notifications` | Show the reminder or the "new task detected" prompt when an in-page card can't be shown. |
| `scripting` | Show the small reminder card on the page the user drifted to, only on sites the user granted access to. |
| `tabGroups` | Keep a task's tabs together in a named tab group and restore them after a break. |
| `declarativeNetRequestWithHostAccess` | Beast Mode: block only the sites the user chooses, only while the user has turned it on. |
| `identity` | "Sign in with Google" for the user's FocusGuard account. |
| Optional host permissions (`https://*/*`, `http://*/*`) | Requested at runtime, only for the specific distraction sites the user approves during onboarding (e.g. youtube.com, reddit.com), so the reminder card can appear there. Never requested for all sites at once. |
| Remote code | None. All code is packaged in the extension. |

## Data usage disclosures (dashboard checkboxes)

- Collects: **Web history** — *yes, processed locally; only site names of confirmed task contexts are sent to our server* · **Personally identifiable information** — email (account) · **User activity** — daily totals.
- Not sold to third parties · not used for purposes unrelated to the single purpose · not used for creditworthiness or lending.

## Assets to prepare

- 128×128 icon (exists in `extension/icons/` — check it matches the final name/brand)
- At least 1 screenshot 1280×800: the corner nudge card on a page; the popup with a context; the welcome-back card; the dashboard Today screen
- Small promo tile 440×280 (optional)
- Privacy policy URL (`docs/PRIVACY_POLICY_DRAFT.md` → published)
