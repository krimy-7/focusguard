# Chrome platform research for the FocusGuard extension (MV3)

Date: 2026-10-10. Scope: the platform facts that constrain SPEC §7–§11 and §14. Sources are developer.chrome.com, Chromium source, and Chrome Web Store (CWS) policy pages. Anything not confirmed by a primary source is marked **[unverified]**.

## TL;DR (what this means for our design)

1. **Drop the content-script `setTimeout` workaround.** `chrome.alarms` has accepted 30-second delays and periods since Chrome 120. Our grace floor is 120s, so every grace, escalation, and snooze timer can be an alarm with an absolute `when`. The current `content.js` comment about a 1-minute minimum is out of date.
2. **The service worker sleeps after 30s idle.** Keep engine state in `chrome.storage.session`, with durable bits in `.local`, and rebuild it on every wake. Don't use timers for the 4s dwell debounce. Compute dwell lazily from timestamps on the next event or alarm.
3. **Detect stale alarms.** Alarms don't wake a sleeping device and fire late on resume. In `onAlarm`, if `Date.now() - alarm.scheduledTime` is more than about 60s, treat it as a sleep or wake: re-check `idle.queryState` and don't nudge.
4. **A context can be a tab group, but group IDs only last one browser session.** Persist `{title, color, tabs:[{url,title}]}` per context in `storage.local`. On resume, recreate the tabs with `tabs.create` → `tabs.group` → `tabGroups.update`. Extensions have no saved-groups or sync API.
5. **No permission-free way exists to put a corner card on an arbitrary page.** `scripting.executeScript` needs host permission for that tab, and `activeTab` needs a user gesture. Use a tiered nudge: an in-page card (closed shadow root) where we hold host access, otherwise `chrome.notifications` plus the badge.
6. **Request host access only for drift sites, at runtime.** Use `optional_host_permissions` and call `permissions.request` from a click in onboarding or Beast Mode setup. Ask for the Red/Yellow seed list (reddit, x, youtube, and so on), not `<all_urls>`.
7. **Remove the static `<all_urls>` content script and `<all_urls>` host permission from the manifest.** Broad host patterns are a named cause of longer CWS review. `tabs` alone gives us URL and title.
8. **For Beast Mode, use `declarativeNetRequestWithHostAccess` with dynamic rules that redirect to `blocked.html`.** `blocked.html` must be listed in `web_accessible_resources`. For "continue anyway", add a higher-priority `allow` **session** rule scoped by `tabIds`, plus an alarm that removes it.
9. **CWS requirements.** We need an in-product prominent disclosure and an affirmative consent screen before any collection, a privacy policy linked in the dashboard, and the Limited Use statement on our site. Under Limited Use, browsing-activity collection is allowed only for a prominently described user-facing feature.
10. **Gemini Nano (Prompt API) is stable for extensions since Chrome 138, but the hardware bar is high.** It needs more than 4 GB VRAM, or 16 GB RAM and 4 cores, plus 22 GB free disk. Treat it only as an optional, feature-detected classifier for "Unknown" domains. Never put it on the critical path.

---

## 1. Service worker lifecycle and `chrome.alarms`

**Lifecycle** ([SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)):
- Chrome stops the worker after **30s of inactivity**. A single event or API call that runs longer than **5 minutes** terminates it, and so does a `fetch()` response that takes more than **30s**.
- Any extension event wakes the worker. Each event received or extension API called resets the idle timer (API calls reset it since **Chrome 110**).
- Several version changes extend lifetime: WebSocket traffic resets the timer (**Chrome 116**), active `debugger` sessions keep the worker alive (**Chrome 118**), and long-lived message ports keep it alive, though since **Chrome 114** opening a port no longer resets the timers.
- There is no hard maximum lifetime. A worker that keeps receiving events can live indefinitely. Deliberate indefinite keepalive is tolerated only for enterprise and education extensions; Chrome may act against other uses ([migrate to SW](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)).
- **Timer pitfalls:** `setTimeout` and `setInterval` "are canceled whenever the service worker is terminated" ([same](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)). Globals are lost as well. Register listeners at the top level, synchronously. A short `setTimeout` (a few seconds) right after a tab event usually survives, because the event just reset the 30s clock, but nothing guarantees it. Design so a lost timer is harmless.

**Alarms** ([chrome.alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)):
- **Minimum delay and period:** 30s. Values below 0.5 min "will not be honored and will cause a warning". The lifecycle page dates this to **Chrome 120**. Unpacked extensions aren't throttled.
- **Precision:** alarms may be delayed "an arbitrary amount" for performance reasons. Treat them as "no earlier than".
- **Max count:** 500 active alarms per extension since **Chrome 117** ([Chromium `alarm_manager.h`](https://chromium.googlesource.com/chromium/src.git/+/HEAD/extensions/browser/api/alarms/alarm_manager.h), [MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms/create)). Since **Chrome 150**, names longer than 1024 bytes throw ([PSA](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/ZQ0VhnottAw/m/qDFUwMv2AgAJ)). We need about three named alarms (`grace`, `escalate`, `bypass:<host>`), so neither limit matters to us.
- **Persistence across browser restart:** `persistAcrossSessions` was added in **Chrome 150** and defaults to `true`. Before 150 the docs call restart behaviour "unpredictable" and advise re-checking important alarms on every startup.
- **Sleep:** alarms "continue to run while a device is sleeping", but "an alarm will not wake up a device". Missed alarms fire on wake. A repeating alarm fires at most once, then reschedules from wake time.
- **Stale detection:** `Alarm.scheduledTime` is available in `onAlarm`. Compute `lateness = Date.now() - alarm.scheduledTime`. If it is large, the device probably slept, so recompute from stored `drift_started_at` and the current idle state instead of nudging blindly.

**Implication:** the engine's `ScheduleTimer` effect becomes `alarms.create(name, {when: deadlineMs})`. Store the deadline in storage too, so `onStartup` can reconcile it.

## 2. `chrome.storage`

Source: [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage).

| Area | Quota | Lifetime | Content-script access by default |
|---|---|---|---|
| `local` | 10 MB (5 MB in Chrome ≤113). `unlimitedStorage` removes the limit | Until uninstall | **Yes** |
| `session` | 10 MB (1 MB in Chrome ≤111) | In memory. Cleared on browser restart, extension reload, update, or disable | **No** |
| `sync` | 100 KB total, 8 KB per item, 512 items | Synced | Yes |

- `setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS'})` (Chrome 102+) controls whether content scripts can read an area. Recommendation: call `chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})` so an injected nudge script can't read resume URLs. Pass the nudge's data in as `executeScript` `args` instead.
- **Write rate:** only `sync` has documented limits (120 writes/min, 1,800/hour). `local` and `session` have none, but each write is async IPC plus disk (for `local`). Batch writes: one `set` per landing event, not one per field. Keep the hot engine state in `session` and the event buffer and resume targets in `local`.

## 3. Tab groups as contexts

Sources: [chrome.tabGroups](https://developer.chrome.com/docs/extensions/reference/api/tabGroups), [chrome.tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs).

- **Create:** `chrome.tabs.group({tabIds, createProperties:{windowId}})` returns a groupId (Chrome 88+). `tabs.ungroup` deletes groups that end up empty.
- **Rename, recolor, collapse:** `tabGroups.update(groupId, {title, color, collapsed})`. There are 9 colors. `tabGroups.move` works in normal windows only. This needs the `tabGroups` permission. Whether that permission shows an install warning is **[unverified]**.
- **Query:** use `tabGroups.query({windowId, title, color, collapsed})` for groups, and `tabs.query({groupId})` or `Tab.groupId` for members (`-1` means ungrouped).
- **Detect users moving tabs in or out:** `tabs.onUpdated` carries `changeInfo.groupId` (Chrome 88+). `tabGroups.onCreated`, `onUpdated` (rename or recolor), `onMoved`, and `onRemoved` also fire; `onRemoved` fires when the user closes the group or its last tab leaves. A move to another window shows up as remove plus create, not `onMoved`.
- **ID persistence:** the docs say "Group IDs are unique within a browser session". Tab IDs have the same wording. Don't persist group IDs across restarts. Re-binding a restored window's groups to contexts (by title or color) is **[unverified]** heuristics, and closing and restoring a window very likely produces new IDs **[unverified]**.
- **Saved tab groups and sync:** no extension API exists. The tabGroups reference documents only a `shared` flag (Chrome 137+). A Chromium engineer confirmed a 2024 bug where `tabGroups.update` and `tabs.update` on a *saved* group failed with "Saved groups are not editable" ([thread](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/2RO1vp-8lqE/m/yHE5vsRCAQAJ)). Its current status is **[unverified]**. Wrap every group call in try/catch.
- **Practical "reopen this context later":** store `{contextId, title, color, tabs:[{url, title, pinned}]}` in `storage.local`, device-only per SPEC §11.2. On resume:
  1. Find tabs that are already open with the same URLs.
  2. `tabs.create({url, active:false})` for the missing ones.
  3. `tabs.group(...)`, then `tabGroups.update({title, color})`, then focus the first tab.

  Keep a session-only `groupId → contextId` map in `storage.session`.

## 4. Showing the nudge

**`chrome.scripting.executeScript` and `insertCSS`** ([scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)): both need the `scripting` permission **plus host access to the target tab**, either from `host_permissions` or from `activeTab`. The default world is `ISOLATED`.

**`activeTab`** ([activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)): it is granted only by an explicit gesture: an action click, a context-menu item, a `commands` shortcut, or an omnibox suggestion. The grant lasts until the user navigates to another site or closes the tab. **Confirmed: it can't be obtained without a gesture**, so it is useless for an unprompted nudge. It carries no install warning.

**Optional host permissions** ([permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)): declare `optional_host_permissions` and call `chrome.permissions.request({origins:[...]})`. The call "must be requested from inside a user gesture", so it has to come from a button in the popup or options page. Use `permissions.onAdded`/`onRemoved` to keep the UI in sync. `permissions.addHostAccessRequest` (Chrome 133+) can surface a non-modal "allow on this site" request in Chrome's UI. That is useful for a later "nudge me here too" flow **[unverified UX]**.

**`chrome.notifications`** ([notifications](https://developer.chrome.com/docs/extensions/reference/api/notifications)):
- Supports at most **2 buttons**, `requireInteraction` (Chrome 50+), and `silent` (Chrome 70+). Clicks arrive through `onButtonClicked`.
- **macOS:** Chrome has used the native notification center since **Chrome 59**. Users must "hover over the notification and select the 'More' button" to see actions, images are dropped, and the Chrome logo is always shown ([blog](https://developer.chrome.com/blog/native-mac-os-notifications)). So buttons technically work on Mac but are hidden.
- **Windows:** button rendering and Focus Assist / Do Not Disturb suppression are **[unverified]**. Expect them to be silently hidden by OS settings.
- Notifications need no host access, but they're the least reliable way to be seen.

**Side panel** ([sidePanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)): `sidePanel.open()` (Chrome 116+) "may only be called in response to a user action". It can't be opened unprompted, so it doesn't work for nudges. It's good for an optional persistent "context" view. `close()` arrived in Chrome 141.

**Popup** ([action](https://developer.chrome.com/docs/extensions/reference/api/action)): `action.openPopup()` is available to all extensions since **Chrome 127** (118–126 was policy-installed extensions only). MDN says Chrome rejects it if the target window isn't focused ([MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/action/openPopup)). Whether it needs a user gesture is **[unverified]**, so test it. If it works from an alarm, it's a permission-free L1 nudge, though the popup closes on any outside click.

**Recommendation: tiered nudge.**
1. **Badge:** `setBadgeText` and `setBadgeBackgroundColor`. Always available, no permission. Use it for the quiet `grace` state.
2. **In-page corner card:** if `permissions.contains({origins:[tabOrigin]})` is true, inject the card with `executeScript` and `insertCSS`. Host access for the Red/Yellow drift list is requested once in onboarding, so most real drifts are covered.
3. **Otherwise:** `chrome.notifications` with `requireInteraction:false`, two buttons ("Back to work", "Extend"), and the body click mapped to "See progress". As an option, try `action.openPopup()` when the window is focused **[unverified]**.

**Injected UI best practice:**
- Attach one host element to `document.documentElement`.
- Use `attachShadow({mode:'closed'})` so page scripts can't reach in through `.shadowRoot`.
- Reset with `:host{all:initial}` and set `z-index:2147483647` and `position:fixed`.
- Use no page globals. Remove the card on `pagehide`.
- Pass copy in through `args` and use `textContent`, never `innerHTML`.
- Page CSP doesn't block isolated-world scripts. Whether a `<style>` or `adoptedStyleSheets` inside the shadow root survives a strict page `style-src` is **[unverified]**, so test on github.com. `insertCSS` with `:host`-scoped selectors is the safe fallback.
- Closed shadow roots hide internals from page JS, not from the user or extensions. They aren't a security boundary for secrets.

## 5. `chrome.idle`

Sources: [idle](https://developer.chrome.com/docs/extensions/reference/api/idle), [Chromium `idle_api.cc`](https://chromium.googlesource.com/chromium/src/+/HEAD/extensions/browser/api/idle/idle_api.cc), [`idle.json`](https://chromium.googlesource.com/chromium/src/+/main/extensions/common/api/idle.json).

- **Detection interval:** the default is 60s. The minimum is **15s**: lower values are clamped silently, not rejected, and the maximum is 4h. Our `INACTIVITY_THRESHOLD_S = 600` is fine.
- **States:** `active`, `idle`, and `locked`. `locked` means "the screen is locked or the screensaver activates". Which OSes report it reliably is **[unverified]**; `getAutoLockDelay` is ChromeOS-only.
- **Sleep:** what `onStateChanged` reports across suspend and resume isn't documented **[unverified]**. Combine it with alarm lateness (§1) to decide "was away, not drifting".

## 6. Beast Mode with `declarativeNetRequest`

Source: [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).

- **Rule types:**
  - **Dynamic rules** persist across browser restarts and extension updates. Use them for a Beast Mode session that must survive a restart.
  - **Session rules** are in memory and are cleared on shutdown or update. Use them for the temporary bypass.
- **Limits (Chrome 120+):** 30,000 dynamic rules (Chrome 121+), 5,000 session rules, and 5,000 "unsafe" (redirect or modifyHeaders) rules each. Before Chrome 120, dynamic and session rules shared one combined limit of 5,000. There are 1,000 regex rules per type. We will use about 20.
- **Permissions:**
  - `declarativeNetRequest` shows an install warning and gives implicit access to block and allow only. It **can't be optional**.
  - `declarativeNetRequestWithHostAccess` shows no install warning but needs host permission for each host.
  - The docs' redirect examples "require host permission". So for opt-in Beast Mode, use `…WithHostAccess` and `permissions.request` the chosen block sites at setup, which is a user gesture.
- **Redirect to our page:** use `action:{type:'redirect', redirect:{extensionPath:'/blocked.html'}}` with `resourceTypes:['main_frame']`, which must be listed explicitly. **`blocked.html` must be in `web_accessible_resources`**, or the redirect errors. Use `requestDomains` for subdomain matching.
- **"Continue anyway" for one site:**
  1. Add a session rule `{priority: 2, action:{type:'allow'}, condition:{requestDomains:[host], tabIds:[tabId], resourceTypes:['main_frame']}}`. `tabIds` works only for session rules. At equal priority, allow beats redirect anyway, but set priorities explicitly.
  2. Create an alarm `bypass:<host>` that calls `updateSessionRules({removeRuleIds})` and re-blocks.

## 7. Chrome Web Store review

Sources: [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use), [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), [Disclosure Requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements), [Review process](https://developer.chrome.com/docs/webstore/review-process).

Relevant policy sections, by name:
- **Quality Guidelines (single purpose):** the extension "must have a single purpose that is narrow and easy to understand". Ours is "focus coach that notices drift from your chosen task". Keep Beast Mode framed as part of that purpose.
- **Use of Permissions** and the FAQ's **Minimum Permission** section: request the narrowest permissions, nothing for future features, and pick the option that touches the least data. Justify each permission in the dashboard.
- **`tabs` vs. host permissions:** `Tab.url`, `title`, and `favIconUrl` are present only with `tabs` *or* host permission for that page. `tabs` alone is the narrower way to read URLs and titles. Host permissions add script injection and network access on top.
- **Limited Use:** browsing data may be used only for the single purpose. No transfers outside the allowed cases, no ads, and no humans reading the data. "Collection and use of web browsing activity is prohibited, except to the extent required for a user-facing feature" that is described prominently in the listing and the UI. The Limited Use compliance statement must be on our website (homepage or one click away).
- **Privacy Policy:** required whenever user data is handled, *even if it is stored only locally* (FAQ). Link it in the Developer Dashboard. It must match the dashboard privacy disclosures.
- **Disclosure Requirements / prominent disclosure:**
  - Must be in-product UI. The store listing doesn't count.
  - Must come before collection starts.
  - Must state what is collected and how it is used.
  - Must require an affirmative user action to consent.
  - A privacy policy alone isn't enough.
  - **Build a first-run consent screen. The service worker sends nothing until it is accepted.**
- **Handling Requirements:** send data only over HTTPS or WSS.
- **Longer or in-depth review:** the triggers named are new developers or extensions, "dangerous permission requests", significant code changes, broad host patterns (`<all_urls>`, `*://*/*`, `https://*/*`, "especially when combined with other permissions"), and sensitive permissions such as `tabs`. Most reviews finish "within a few days", some take "up to a few weeks", and you should contact support after 3 weeks. Whether *optional* broad host patterns count is **[unverified]**.

## 8. Built-in AI (Prompt API / Gemini Nano)

Sources: [Built-in APIs status](https://developer.chrome.com/docs/ai/built-in-apis), [Prompt API](https://developer.chrome.com/docs/ai/prompt-api), [Chromium extension doc](https://chromium.googlesource.com/chromium/src/+/main/docs/experiments/prompt-api-for-extension.md).

- **Status:** stable for **extensions since Chrome 138**. The web shipped in Chrome 148, and a sampling-params origin trial started in Chrome 148. Remove any old `aiLanguageModelOriginTrial` permission.
- **Hardware:**
  - OS: Windows 10/11, macOS 13+, Linux, or ChromeOS on Chromebook Plus. Android and iOS aren't supported.
  - Disk: 22 GB free on the profile volume. The model is removed if free space falls below 10 GB.
  - Compute: GPU with more than 4 GB VRAM, *or* CPU with 16 GB RAM and 4 or more cores.
  - Network: unmetered for the first download only.
- **API:** `LanguageModel.availability(opts)` returns `'unavailable' | 'downloadable' | 'downloading' | 'available'`; the Prompt API page itself documents only `downloading` and `unavailable` **[partly unverified]**. Use `LanguageModel.create()`; starting the download **needs user activation**. `prompt(text, {responseConstraint: <JSON Schema>})` gives structured output. Input languages are en, ja, es, de, and fr.
- **Service worker:** the API "isn't available in Web Workers". The Chromium extension doc mentions detection from "window and worker scripts". Whether it runs in the extension service worker is **[unverified]**. The fallback is an offscreen document.
- **Fit for "is this tab related to context X?":** yes, offline, as a boolean or enum JSON schema over `{domain, sanitized title, context title}`. That replaces the SPEC §9.2 "Unknown → ask cheap model once" step on capable devices, with the result cached per domain and context. Most users won't have the hardware, so the deterministic seed list plus the "unknown → trust" default stays primary.

## Recommended permission set for v1

```json
{
  "minimum_chrome_version": "120",
  "permissions": [
    "tabs",
    "storage",
    "alarms",
    "idle",
    "notifications",
    "scripting",
    "tabGroups",
    "declarativeNetRequestWithHostAccess"
  ],
  "optional_host_permissions": ["https://*/*", "http://*/*"],
  "web_accessible_resources": [
    { "resources": ["blocked.html"], "matches": ["<all_urls>"] }
  ]
}
```

No `host_permissions` and no static `content_scripts`. Remove both `<all_urls>` entries that the manifest has today.

| Permission | One-line justification |
|---|---|
| `tabs` | Read the active tab's URL and title to match it to the user's chosen context, and focus or reopen context tabs. |
| `storage` | Keep engine state, the event buffer, and device-only resume targets. |
| `alarms` | Grace, escalation, snooze, and bypass timers that survive service-worker shutdown (30s minimum, so Chrome 120+). |
| `idle` | Tell "stepped away" or a locked screen apart from drift, so we never nudge an absent user. |
| `notifications` | Fallback nudge when we have no host access to show an in-page card. |
| `scripting` | Inject the small corner nudge card into drift-site tabs the user granted access to. |
| `tabGroups` | Represent each context as a named, colored tab group and restore it on resume. |
| `declarativeNetRequestWithHostAccess` | Opt-in Beast Mode site blocking. No install warning, and it acts only on sites the user picked and granted. |
| `optional_host_permissions` | Requested at runtime from a user click, only for drift sites or Beast Mode block lists. Never granted at install. |
| `web_accessible_resources` (`blocked.html`) | Required target for the DNR redirect. Could be narrowed to the block-list patterns. |

Skipped: `sidePanel` (can't open unprompted; add it with a persistent context view), `offscreen` (add only if the Prompt API turns out to need a document context), and `unlimitedStorage` (10 MB is plenty).
