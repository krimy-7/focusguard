# FocusGuard: focus-recovery research brief

Date: 2026-10-10. Scope: interruption science, distraction interventions, ADHD design, competitors, store policy, on-device LLMs.
Method: primary sources where reachable (papers, official docs, pricing pages). "Unverified" means I could not confirm it from the source that owns the claim. Pricing was checked on 2026-10-10 and changes often.

## TL;DR

1. **KEEP the recovery card, and make it impossible to miss.** Visible cues to a suspended task speed resumption ([Iqbal & Horvitz 2007](https://www.erichorvitz.com/CHI_2007_Iqbal_Horvitz.pdf)). A subtle cue, such as just restoring the tab, worked no better than no cue at all ([Trafton et al. 2005](https://www.interruptions.net/literature/Trafton-HFES05.pdf)).
2. **ADD a 1-tap "where was I?" note at the moment of leaving.** A ready-to-resume plan has direct experimental support for reducing attention residue ([Leroy & Glomb 2018](https://doi.org/10.1287/orsc.2017.1184)). Use the note as the "you were doing X, next is Y" text instead of an LLM guess.
3. **KEEP a grace period before nudging, and tune it from data.** People switch screens constantly: median screen focus was about 40 s ([Mark et al. 2016](https://ics.uci.edu/~gmark/Home_page/Publications_files/CHI%2016%20Multitasking%20and%20Focus.pdf)). Most diversions return on their own, but 27% of alert-driven diversions lasted more than 2 h ([Iqbal & Horvitz 2007](https://www.erichorvitz.com/CHI_2007_Iqbal_Horvitz.pdf)). No study gives an "optimal 5 minutes", so make the threshold configurable and A/B it.
4. **CHANGE escalation so it always tells the user what is happening and why.** In HabitLab, rotating interventions cut time-on-site by 34% but raised 7-day attrition from 32% to 61%. A just-in-time explanation halved attrition ([Kovacs et al. 2018](https://hci.stanford.edu/publications/2018/habitlab/habitlab-cscw18.pdf)).
5. **KEEP Beast Mode opt-in only, and offer "dismiss/continue anyway" friction before hard blocks.** Blocking raises self-rated focus, but it raised workload and stress for people who already felt in control ([Mark et al. 2018](https://www.ics.uci.edu/~gmark/Home_page/Publications_files/CHI%202018%20Workplace%20Distractions.pdf)). In one sec's study, the "cancel opening" option did most of the work ([Grüning et al. 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC9974409)).
6. **CUT or soften streak-loss messaging.** Broken streaks displayed in logs reduce later engagement. Letting users "repair" a streak attenuates the effect ([Silverman & Barasch 2023](https://udspace.udel.edu/handle/19716/34160)). Use non-punitive wording for ADHD users, given strong evidence of emotion dysregulation in adult ADHD ([Beheshti et al. 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7069054/)).
7. **CHANGE the LLM path. Stop sending site + goal to OpenRouter's free models.** Chrome's Prompt API (Gemini Nano) works in extensions and sends no data off-device ([Chrome docs](https://developer.chrome.com/docs/extensions/ai/prompt-api)). Fall back to templates, because the messages are 12 words anyway.
8. **CHANGE extension permissions before submitting.** Drop the `<all_urls>` content script if `tabs` events suffice, or justify it. You need a privacy policy, prominent disclosure with consent, and a Limited Use statement ([CWS policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use/)).
9. **CHANGE the Android blocker architecture.**
   - `dataSync` FGS is the wrong type and stops after 6 h/24 h on Android 15 ([Android 15 changes](https://developer.android.com/about/versions/15/behavior-changes-15)).
   - Launching your activity from a service is blocked without an exemption such as `SYSTEM_ALERT_WINDOW` ([background starts](https://developer.android.com/guide/components/activities/background-starts)).
   - `QUERY_ALL_PACKAGES` is likely unjustifiable when the `<queries>` launcher intent already exists ([Play policy](https://support.google.com/googleplay/android-developer/answer/10158779)).
10. **POSITION on resumption, not blocking.** Most self-control tools (74%) block ([Lyngs et al. 2019](https://arxiv.org/pdf/1902.00157)). Tab managers save context but don't detect drift. Nobody combines "declared goal → drift detection → resumption cue" in the browser. That gap is FocusGuard's wedge, especially for ADHD students and devs.

---

## 1. Interruption and resumption science

**Costs are real, but the famous "23 minutes" is shakier than claimed.**

- **Field logging (Iqbal & Horvitz 2007).** 27 users were logged for 2 weeks ([paper](https://www.erichorvitz.com/CHI_2007_Iqbal_Horvitz.pdf)).
  - Alert-driven diversions averaged about 9.5 min. Resuming the prior task took another 10–16 min.
  - 27% of alerts kept users away from their previously active window for more than 2 h.
  - Windows more than 75% visible were returned to significantly faster than windows less than 25% visible. The authors explicitly recommend tools that "automatically save task context on suspension" and give "easy access to suspended task context."
  - They warn that recovery cues must not themselves become disruptions.
- **Lab study (Mark, Gudith & Klocke 2008).** Interrupted participants finished faster with no quality loss, but reported more stress, frustration, time pressure and effort ([paper](https://www.ics.uci.edu/~gmark/chi08-mark.pdf)). The cost is partly emotional, not only time.
- **Fragmented work (Mark et al. 2005).** Most interrupted work is resumed the same day, but only after more than two intervening activities ([abstract](https://isr.uci.edu/node/1329.html)). The "~25 min to resume" figure circulates via lecture slides. **Unverified** against the paper's full text.
- **Self-interruptions.** These are a large share of switches and are tied to prospective-memory events, i.e. being reminded of something ([Dabbish, Mark & González 2011](https://isr.uci.edu/node/1353.html)). Drift is often internally triggered, which FocusGuard's tab watching can actually see.
- **Attention fragmentation.** Median online screen-focus duration was 40 s ([Mark et al. CHI 2016](https://ics.uci.edu/~gmark/Home_page/Publications_files/CHI%2016%20Multitasking%20and%20Focus.pdf)).

**The mechanism: memory for goals.**

- Altmann & Trafton model suspended goals as memory traces that decay and must be re-primed by cues associated with them ([Cognitive Science 2002](https://www.interruptions.net/literature/Altmann-CogSci02.pdf)). Two implications follow. Resumption lag is inevitable. Cues encoded at suspension time are what make retrieval fast.
- Preparation during the "interruption lag" (the moment before switching) speeds resumption ([Trafton et al. 2003](https://interruptions.net/literature/Trafton-IJHCS03.pdf)). Even a 3 s lag helps ([Hodgetts & Jones 2006](https://www.interruptions.net/literature/Hodgetts-JEP_LMC06.pdf)).
- In Trafton, Altmann & Brock 2005, a **blatant** cue (red arrow) sped resumption. A **subtle** cue (cursor at last position) was no better than no cue ([HFES 2005](https://www.interruptions.net/literature/Trafton-HFES05.pdf)).

**The ready-to-resume plan (the specific question).**

- Leroy (2009) introduced "attention residue": thoughts about a prior unfinished task reduce performance on the next task ([OBHDP, doi:10.1016/j.obhdp.2009.04.002](https://doi.org/10.1016/j.obhdp.2009.04.002)).
- Leroy & Glomb (2018) ran four studies, including a field survey of 202 professionals ([Organization Science](https://doi.org/10.1287/orsc.2017.1184)). They found that a brief written plan made at the interruption reduces residue and improves performance on the **interrupting** task. The plan notes where to resume, what challenges remain, and what to postpone ([UW summary](https://www.washington.edu/news/2018/01/16/task-interrupted-a-plan-for-returning-helps-you-move-on/)).
- **Caveat:** the benefit to the *resumed* task was the authors' conjecture, not a tested result. Full text was not accessible (paywall). Details come from the abstract and the university release.

**Verdict for the recovery card.**

| Design choice | Evidence |
|---|---|
| Show "you were doing X" on return | Supported. Cues prime suspended goals (Altmann & Trafton). Visibility speeds return (Iqbal & Horvitz). |
| Make it prominent, not a subtle badge | Supported. Blatant cues beat subtle ones (Trafton 2005). |
| "Next is Y" | Supported if Y comes from the user. The value is in encoding at suspension time (Trafton 2003, Leroy & Glomb 2018). |
| Auto-generated summary only, with no user note | Weaker. The literature supports *user-encoded* cues. LLM-inferred "next steps" are untested. |
| Card on every return | Risky. Iqbal & Horvitz warn that recovery aids can become disruptions. Skip it for sub-grace switches. |

---

## 2. Nudges vs blocking vs friction

**What the tool landscape does.**

- **Lyngs et al. (CHI 2019)** reviewed 367 tools ([arXiv](https://arxiv.org/pdf/1902.00157)):
  - 74% block or remove distractions.
  - 35% do "goal advancement". Of those, 58 remind users of a concrete task, which is FocusGuard's category.
  - Only 2 used delays.
  - Habit scaffolding and self-efficacy ("expectancy") are underexplored.
- **Lyngs et al. (CHI 2020)** tested goal reminders vs. newsfeed removal on Facebook with 58 students. Both helped users stay on task, but **goal reminders tended to irritate** ([abstract record](https://www.cs.ox.ac.uk/people/publications/bibtex/Ulrik.Lyngs.html); details via [talk](https://vimeo.com/423318322); full text not read). This directly warns about FocusGuard's nudge tone and frequency.

**Friction (one sec).** [Grüning, Riedel & Lorenz-Spreen, PNAS 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC9974409):

- Field data: 280 completers out of 719 recruited, 6 weeks, no control group. The intervention was a 10 s delay plus deliberation message plus option to cancel.
  - 36% of open attempts were dismissed.
  - Open attempts fell 37% over 6 weeks.
- Controlled experiment (N=500):
  - **The "dismiss" option was the active ingredient.**
  - The delay helped but added nothing beyond dismiss.
  - The message alone did nothing.
- About 61% dropped out of the study, and dropouts saw their use as less problematic, so expect self-selection.

**Blocking.** [Mark, Czerwinski & Iqbal, CHI 2018](https://www.ics.uci.edu/~gmark/Home_page/Publications_files/CHI%202018%20Workplace%20Distractions.pdf), 32 workers, 1 week:

- Blocking raised self-rated focus and productivity, most for people low in perceived control or prone to social media.
- People already high in control reported **higher workload**. They also took fewer breaks and reported more stress.

So blocking should be opt-in and should still schedule breaks, which matches Beast Mode being opt-in plus Pomodoro.

**What drives uninstall (HabitLab).** [Kovacs, Wu & Bernstein, CSCW 2018](https://hci.stanford.edu/publications/2018/habitlab/habitlab-cscw18.pdf):

- Static interventions lose effect daily, as users habituate.
- Rotation raised effectiveness, but 7-day retention dropped to 39% (rotation) vs 68% (static).
- Uninstall feedback cited:
  - wrong mental model ("didn't understand the concept")
  - wanting tracking, not interventions
  - interventions "on every page load" being too much
  - "not forceful enough"
- A just-in-time notice explaining each new intervention raised 7-day retention from 44% to 79%.
- HabitLab enabled by default only the interventions with low attrition in pilots.
- Follow-up: users drift toward easier interventions over time but expect to re-strengthen "next time" ([Kovacs et al. 2021](https://arxiv.org/abs/2101.11743)).

Implication: FocusGuard's playful escalation is a form of rotation. Explain each escalation level the first time it appears, and let users cap the level.

**Timing and notification fatigue.**

- Notifications delivered at task **breakpoints** reduced frustration and reaction time vs immediate delivery ([Iqbal & Bailey, CHI 2008](https://www.interruptions.net/literature/Iqbal-CHI08.pdf)). A nudge should fire when the user is switching (tab change or idle→active), not mid-scroll.
- Merely *receiving* a phone notification impaired attention-task performance about as much as using the phone ([Stothart et al. 2015, JEP:HPP](https://doi.org/10.1037/xhp0000100)). Every nudge has a cost.
- A day without notifications made people feel more productive but some felt anxious or disconnected ([Pielot & Rello, MobileHCI 2017](https://arxiv.org/pdf/1612.02314)).

**Optimal grace period:** no study found that identifies one. Proxies:

- Typical time on an app before switching was under 1 min on average, with a mean maximum just over 4 min ([Iqbal & Horvitz](https://www.erichorvitz.com/CHI_2007_Iqbal_Horvitz.pdf)).
- Long diversions (>2 h) are common enough to justify eventually nudging.

A ~5-min default is defensible but **not evidence-derived**. Log nudge→return latency and dismissal rate per grace setting.

---

## 3. ADHD-specific design

| Claim | Evidence strength | Notes |
|---|---|---|
| Emotion dysregulation is a core adult ADHD feature | **Well supported** | Meta-analysis: 13 studies, N=2,535, Hedges' g=1.17 vs controls ([Beheshti et al. 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7069054/)). Justifies non-punitive copy. |
| "Rejection sensitive dysphoria" (RSD) | **Weak / folk** | Not in DSM-5 or ICD-11. The RSD-specific literature is small and mostly qualitative. Design for emotion dysregulation, not RSD branding. |
| Time perception differs in ADHD ("time blindness") | **Moderate** | A meta-analysis of 55 studies (mostly child/mixed samples) found timing deficits ([Southampton eprint](https://eprints.soton.ac.uk/456003)). Adult evidence is "very scarce" and mixed ([Mette 2023 review](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9962130/)). Visible timers are reasonable but not proven to fix it. |
| External working-memory aids help | **Theory-backed, sparse direct trials** | Consistent with memory-for-goals cueing (Section 1). I found no RCT of tab-context cues in ADHD. **Unverified** as ADHD-specific. |
| Body doubling works | **Weak (growing)** | Survey of 220 people, 193 neurodivergent, describing it as a community practice (Eagle & Ringland 2024, *TACCESS*, doi:10.1145/3689648; read via third-party summary only, **unverified**). VR study, N=12, positive ([arXiv 2509.12153, 2025](https://arxiv.org/abs/2509.12153)). Interviews with 14 ADHD devs ([Pimenova et al. 2026](https://arxiv.org/abs/2609.21254)): AI copresence gave accountability *without* the surveillance and judgment of human observers. |
| Streaks motivate; broken streaks demotivate | **Supported (general population, 7 studies)** | ([Silverman & Barasch 2023](https://udspace.udel.edu/handle/19716/34160)). Worse when the user blames themselves. Softened by streak "repair". No ADHD-specific data found. |
| ADHD tech research is deficit-framed | **Supported (critical review)** | Most ADHD tech aims to suppress traits that disturb neurotypical norms, with little co-design ([Spiel et al. CHI 2022](https://doi.org/10.1145/3491102.3517592)). |
| Self-tracking is emotionally costly for neurodivergent users | **Emerging (qualitative)** | ([Rudberg Selin et al. CHI 2026](https://arxiv.org/abs/2603.22609)) |

Design implications:

- Copy should never say "you failed" or "you wasted X min". Frame the return as success ("welcome back").
- Mood log and progress views should avoid red/negative totals.
- An *AI* copresence ("FocusGuard is here with you") is a plausible low-cost body double that avoids the social costs of human ones. Mark it experimental.

---

## 4. Competitor landscape

Prices are from official pages, 2026-10-10.

| Product | What it is / price | FocusGuard has, they lack | They have, FocusGuard lacks |
|---|---|---|---|
| [RescueTime](https://www.rescuetime.com/pricing) | Auto time tracking, Focus Sessions with blocking, goals & alerts. $7–9/mo solo. | Goal-aware drift detection, resumption card | Mature cross-app desktop tracking, timesheets |
| [Rize](https://rize.io/pricing) | AI auto time tracking, categorization, "smart breaks". $9.99–39.99/mo | Nudges back to a declared goal, recovery card, blocker | Desktop-wide (not browser-only) tracking, AI insights |
| [Sunsama](https://www.sunsama.com/pricing) | Daily planning, ~20 integrations. $17–22/mo | In-the-moment drift detection, free tier | Calendar/task integrations, polished planning ritual |
| [Motion](https://www.usemotion.com/pricing) | AI auto-scheduling + projects. $19–29/seat/mo | Attention/resumption layer | Auto-scheduling, team PM |
| [Akiflow](https://www.akiflow.com/pricing) | Time blocking, planning ritual. $19–34/mo, no free plan | Same as Sunsama | Same as Sunsama. Amie not checked (**unverified**) |
| [Freedom](https://freedom.to/premium) | Cross-device blocker, Locked Mode. Free; $3.33–8.99/mo; $99.50 lifetime | Gentle mode, resumption | Robust cross-device blocking, scheduling |
| [Cold Turkey](https://getcoldturkey.com/pricing/) | Desktop blocker, locking, breaks & allowances. Pro is one-time (price not listed, **unverified**) | Everything non-blocking | Unbypassable desktop blocking |
| [one sec](https://one-sec.app/) | Friction before opening apps/sites (breathing etc.), intentions, iOS/Android/extension. Free core + Premium | Goal-context awareness, resumption | Peer-reviewed efficacy (PNAS), mobile friction |
| [Opal](https://opalapp.com/pricing) | Phone/Mac blocker, Opal Score, Hard Mode. Free; $19.99/mo, $99.99/yr, $399 lifetime | Browser context, resumption | Polished mobile blocking, scoring |
| [ScreenZen](https://screenzen.co/) | Free friction/limits app (donations), iOS/Android/macOS/Windows | Resumption, planning | Free, multi-platform friction |
| [Forest](https://www.forestapp.cc/) | Gamified focus timer (tree dies if you leave). Free core + Plus | Non-punitive return | Strong gamification, real-tree tie-in |
| [Focusmate](https://www.focusmate.com/pricing/) | Human body-doubling video sessions. 3 free/week; $8–12/mo | Always-on, no social cost | Real human accountability |
| [Tiimo](https://www.tiimoapp.com/pricing) | ADHD visual planner, AI breakdown, timers, widgets. Free (mobile) + Pro | Drift detection, browser recovery | Visual timeline, ADHD brand trust |
| [Llama Life](https://llamalife.co/) | Timeboxed task lists, ADHD positioning. Price **unverified** | Drift/recovery | Timeboxed lists |
| [Session](https://www.stayinsession.com/pricing) | Mac Pomodoro + blocking + reflection. Free; $4.99/mo | Cross-platform, goal drift | Native Mac polish, calendar logging |
| Centered | centered.app now redirects to **Sukha** ([pricing](https://www.thesukha.co/pricing)): $20/mo or $400 lifetime; AI task manager, blocking, flow music. Original "flow coach" features **unverified** today | Free, resumption card | Flow music, AI next-step breakdown |
| [Workona](https://workona.com/pricing/) / [Toby](https://www.gettoby.com/pricing) / [OneTab](https://www.one-tab.com/) | Tab workspaces / session save-restore. Toby free–$10/mo; OneTab free, URLs never transmitted | **Drift detection + goal + nudge** | Explicit multi-tab context save/restore. *This is the feature FocusGuard should borrow.* |
| [Microsoft Recall](https://support.microsoft.com/en-us/windows/retrace-your-steps-with-recall-aa03f8a0-a78b-4b3e-b0a1-2eb8ac48701c) | Opt-in local encrypted screen snapshots, searchable. Copilot+ PCs only (40+ TOPS NPU, 16 GB RAM) | Goal awareness, nudging, runs anywhere | Full-fidelity "what was I looking at" retrieval |
| [Windows Focus](https://support.microsoft.com/en-us/windows/how-to-use-focus-in-windows-11-cbcc9ddb-8164-43fa-8919-b9a2af072382) | Timer + DND + To Do tasks in Clock app | Drift detection, recovery | OS-level DND, free |
| [Apple Focus](https://support.apple.com/guide/iphone/set-up-a-focus-iphe7c7ba1b3/ios) / Screen Time | Notification filtering by mode; app limits | Goal context, recovery | OS integration (details of Focus filters **unverified** here) |
| Rewind / Limitless | Screen-memory "resume" tool; Mac capture shut off 2025-12-19 after Meta acquisition ([9to5Mac](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/)) | — | (gone) |
| Heyday | AI browser memory. Current status **unverified** | — | — |

**Underserved segment:** browser-centric students, developers and remote workers, especially ADHD, who don't want to be locked out but lose the thread.

- Blockers optimize prevention.
- Planners optimize the morning.
- Tab managers save context only when the user remembers to.
- Recall retrieves passively, with no goal and no hardware reach.

**No product found automatically links a declared goal to drift detection and then a resumption cue.** The closest were RescueTime Focus Sessions and Sukha. FocusGuard's defensible piece is the *return* moment, not the blocker. The blocker is commoditized (Freedom, Opal, ScreenZen free).

---

## 5. Platform policy: what shipping requires

### Chrome Web Store

FocusGuard's current manifest has `tabs`, `<all_urls>` host permission, and a content script on all URLs at `document_start`.

- **Limited Use.** "Collection and use of web browsing activity is prohibited, except to the extent required for a user-facing feature that is prominently described" on the store page **and** in the UI ([Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use/)). Other conditions:
  - Use is limited to the single purpose.
  - Transfers to third parties only to provide that purpose.
  - No human reading without consent.
  - An **affirmative Limited Use compliance statement** on your website.
- **Program policies** ([policies](https://developer.chrome.com/docs/webstore/program-policies/policies)):
  - A privacy policy that lists *all parties* data is shared with. This includes the OpenRouter LLM provider and FocusGuard's own backend.
  - **Prominent disclosure + affirmative consent**.
  - Narrowest permissions.
  - A single, narrow purpose.
- **Permission warnings.**
  - `tabs` shows "Read your browsing history" ([list](https://developer.chrome.com/docs/extensions/reference/permissions-list)).
  - All-sites host access is the broadest warning, and it subsumes the `tabs` warning ([warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)).
  - `activeTab` shows no warning, but is only granted on user gesture, so it can't do passive drift detection.

To ship:

1. Ask whether the content script is needed. It reports visibility/presence. `chrome.tabs`/`chrome.windows` focus events plus `chrome.idle` may cover this without all-sites access. **Untested.**
2. If you keep it, write a one-sentence single purpose, e.g. "compares the site you're on to your focus goal and helps you return".
3. Show a first-run disclosure screen with an explicit accept.
4. Publish a privacy policy and the Limited Use statement.
5. Disclose the LLM transfer, or move it on-device (Section 6).
6. Do not ship OpenRouter API keys inside the extension (`extension/config.js`). Anyone can extract them.

### Google Play

The Android module currently has `PACKAGE_USAGE_STATS`, `QUERY_ALL_PACKAGES`, a `dataSync` foreground service, and `startActivity` from the service.

- **`QUERY_ALL_PACKAGES`**: permitted only when installed-app discovery is the core purpose (e.g. antivirus, file managers, browsers). It requires a Permissions Declaration Form and is rejected if "a less broad app-visibility method" works ([policy](https://support.google.com/googleplay/android-developer/answer/10158779)). The manifest already has a `<queries>` LAUNCHER intent, which covers listing launchable apps. **Remove `QUERY_ALL_PACKAGES`.**
- **Installed-app inventory is personal and sensitive data.** This requires:
  - in-app prominent disclosure before the permission prompt
  - affirmative consent, not dismissable by back/home
  - a privacy policy linked in Console and in-app
  - an accurate Data safety section ([User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311))
- **`PACKAGE_USAGE_STATS`** is a special app-access the user grants in Settings. I did not find a Play declaration form specific to it (**unverified**). Treat it under the User Data policy above.
- **Foreground service type.** Play requires declaring each FGS type with a description and demo video ([FGS policy](https://support.google.com/googleplay/android-developer/answer/13392821)).
  - `dataSync` is for user-initiated transfer/backup, and on Android 15 it is capped at **6 h per 24 h** and then times out ([Android 15](https://developer.android.com/about/versions/15/behavior-changes-15)). A focus blocker doesn't fit.
  - Use `specialUse` with a `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` explanation, which Play reviews ([FGS types](https://developer.android.com/develop/background-work/services/fgs/service-types)). Keep Beast sessions user-started and time-boxed.
- **Bringing FocusGuard to the front.** A foreground service is *not* an exemption from background-activity-start restrictions ([docs](https://developer.android.com/guide/components/activities/background-starts)). The current `startActivity` from `BeastGuardService` will likely be silently blocked. Options:
  - **(a)** `SYSTEM_ALERT_WINDOW` with an overlay. This needs user grant. On Android 15, using it to start an FGS from the background also needs a *visible* overlay.
  - **(b)** A high-priority notification with full-screen intent. Policy on full-screen intent was not checked (**unverified**).
  - **(c)** `AccessibilityService`, which most blockers use. Play requires a separate in-app disclosure, consent, a declaration form and a video. "Monitoring apps" are listed as not accessibility tools ([policy](https://support.google.com/googleplay/android-developer/answer/10964491)). This is the highest review risk. Avoid it unless (a) fails.

---

## 6. Privacy-preserving LLM use

Current code sends `contextTitle` and the distraction hostname to `openrouter.ai` using `openrouter/free`. OpenRouter states each provider has its own data-handling policy. Training opt-outs are separate account settings for paid vs free models ([OpenRouter logging docs](https://openrouter.ai/docs/guides/privacy/logging)).

**Chrome Prompt API (Gemini Nano)** ([extension docs, updated 2026-08-26](https://developer.chrome.com/docs/extensions/ai/prompt-api)):

- Available to extensions. The status label shows Chrome 138; exact stable date is not stated on the page.
- "No data is sent to Google or any third party when using the model." Network is used only for the one-time model download.
- Requirements:
  - Windows 10/11, macOS 13+, Linux, or ChromeOS on Chromebook Plus. **No Android/iOS.**
  - 22 GB free disk.
  - GPU with more than 4 GB VRAM, or CPU with 16 GB RAM and 4+ cores.
- Languages: en, ja, es, de, fr.
- Remove the expired `aiLanguageModelOriginTrial` permission if present.

**Recommended layering:**

1. **Templates first.** Nudges are at most 12 words. A curated, rotating pool, explained per HabitLab, needs no model.
2. **Gemini Nano when `LanguageModel.availability()` reports available.** Use it for personalized nudges and for summarizing the user's own resume note.
3. **Server LLM only with opt-in.** Send minimized data (goal text, no URLs), use a zero-retention provider, and list it in the privacy policy as required by CWS.

For mobile (morning voice→goals), Nano is not available on Android/iOS via this API. Server-side processing needs Play prominent disclosure if audio or transcripts leave the device.

---

## Feature implications

| Feature | Evidence for | Evidence against | Recommendation |
|---|---|---|---|
| Recovery card on return | Cues prime suspended goals (Altmann & Trafton 2002). Visibility speeds return (Iqbal & Horvitz 2007). Blatant > subtle cues (Trafton 2005). | Recovery aids can themselves disrupt (Iqbal & Horvitz). | **Keep.** Make it prominent. Show only after the grace period has elapsed. |
| Ready-to-resume note when leaving | Leroy & Glomb 2018 (4 studies). Interruption-lag preparation (Trafton 2003). | Benefit to resumed task untested. Adds friction at the exit moment. | **Add** as optional 1-tap/voice note. Feed it into the card. |
| 5-min grace before nudge | Short switches are normal (40 s median focus). Long diversions are common (27% >2 h). | No study defines an optimal delay. | **Keep, make configurable**, instrument it. |
| Playful escalation | Rotation increases effectiveness (Kovacs 2018). | Rotation more than doubles 7-day attrition. Goal reminders irritate (Lyngs 2020). | **Change.** Explain each level just-in-time. Let users cap it. |
| Nudge timing | Breakpoint delivery reduces frustration (Iqbal & Bailey 2008). | Each notification has an attention cost (Stothart 2015). | Fire on tab-switch/idle-return, not on a timer mid-activity. |
| Beast Mode blocker | Blocking raises focus for low-control users (Mark 2018). | Higher workload and stress for high-control users. Blocking drives HabitLab attrition. Commoditized. | **Keep opt-in.** Add a "continue anyway" dismiss path (one sec). Fix the Android architecture. |
| Friction delay before distracting site | PNAS one sec: 36% dismissals, 57% fewer opens. | Delay adds little beyond the dismiss option. | Add the dismiss step. Keep any delay short. |
| Streaks | Intact streaks raise engagement (Silverman & Barasch 2023). | Broken streaks reduce engagement, especially with self-blame. ADHD emotion dysregulation. | **Change.** Add streak repair/freeze. Never shame. |
| AI copresence / body double | AI copresence avoids human-observer costs for ADHD devs (Pimenova 2026). VR N=12. | Efficacy evidence thin. | **Experiment**, labelled beta. |
| Pomodoro / visible timers | Timing deficits in ADHD (meta-analysis). Breaks offset blocking stress (Mark 2018). | Adult evidence scarce. | Keep. Low cost. |
| Mood log | Emotion dysregulation is core in ADHD. | Self-tracking is emotionally costly for neurodivergent users (CHI 2026). | Keep optional. Neutral visuals. No negative totals. |
| Cloud LLM nudges (OpenRouter free) | Personalization. | Third-party transfer of browsing data under CWS Limited Use. Keys exposed in extension. | **Replace** with templates + Gemini Nano. Server only as opt-in. |
| `<all_urls>` content script | Accurate presence detection. | Broadest permission warning. Narrowest-permission rule. | **Re-evaluate.** Try `tabs` + `windows` + `idle` first. |
| Tab-set snapshot per goal | Iqbal & Horvitz: "automatically save task context". Workona/Toby/OneTab validate demand. | Storage/privacy scope grows. | **Add** (local only). Restore the goal's tabs from the recovery card. |
