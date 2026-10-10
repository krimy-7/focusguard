---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: ["extension"]
---

# Surface brief — FocusGuard AI app UI (dashboard + extension)

Scope: web dashboard (`src/app`: sign-in, Today, History, Settings, shell) and extension UI (`extension/popup`, `onboarding`, `nudge/card.js`, `blocked.html`, `auth/google.html`, toolbar icons). Visitor mode: **Operate**. Approved sample: `.impeccable/mocks/samples/lattice-brick.html` (textured brick; critique reference; code-led build). Canonical brand assets: `extension/brand/` (yeti.svg, lattice.svg, brick.svg, grain.svg, plaster.svg) — every surface draws from these.

Audience/job: students and developers in Nepal/India, many with ADHD, getting back to what they meant to do. Constraints: PRODUCT.md (no shaming, no scores, privacy literal, WCAG 2.2 AA + ADHD-aware, Devanagari).

Memorable moment: the carved lattice leaf sliding closed as FocusGuard waits, and open again when you're back.

Unresolved: Nepali copy timing; "context" vs "task" wording (build uses "task" in user-facing copy, "context" only where it names the tracked thing in Settings).

## Direction contract

THESIS: FocusGuard looks out through a carved Newari lattice — it notices your drift and you are never seen. Refuses the category's soft-teal wellness-SaaS cards and its neon "hardcore focus" opposite.

OWN-WORLD: Fired-brick shell rail (#9A3E24) rendered as textured Newari dachi-apa coursing with fired-clay grain (never a flat fill), sal-wood ink (#2B1E17, never pure black), brass (#C8963E, fills only) for waiting, moss (#4E6B3C) for on-task, lime-wash ground drifting cool→warm. Mukta for everything FocusGuard says; Kalam only for the user's own words. A carved frame + sliding lattice leaf (inline SVG) is the one ornament, and it always carries state. Small calm Yeti looks out of the window.

STORY: You open it and read one kind sentence about your day, see your task in its window and whether FocusGuard is watching, waiting or paused, and act on your goals. Mid-drift, a small window in the corner offers Back.

FIRST VIEWPORT: Dashboard Today — brick rail left (Yeti-window mark, Today/History/Settings). Main column ≤720px: date eyebrow, the day's sentence at 44px with key phrase underlined in brass, then the task window (lattice state, title, mode, minutes, site names, Take a break / Pause), then goals in Kalam with add box. Primary action: Back (nudge) / Add goals (dashboard).

FORM: Tikijhyal lattice window, candidate 6 of 7 on the grounded list, seed key f0d36cd3.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Raises (from the declined challengers — binding)
- One geometry drives art and state: the same lattice SVG frames the Yeti and encodes on task / waiting / paused / private.
- Ground is never neutral: lime-wash drifts cool→warm; ink is sal-wood, never #000.
- Popup and nudge card use one type size (16px); rank by weight, case and reversal only.
- History days are plates at one fixed scale so days compare by shape — no scores.
- State restyles in place (brass waiting, moss back); nothing ever turns red. Error-red exists only for destructive confirmation copy (delete account).
- The user's own words (goals, break notes) in Kalam; FocusGuard's words in Mukta. Both cover Devanagari.

## Texture (maintainer decision 2026-10-10: "looked super plain")
- Rail + popup header: `brick.svg` tile (96×40) under `grain.svg` (multiply), soft inner shadow on the rail's content edge; cream text stays ≥5:1 on every brick tone.
- Ground: `plaster.svg` grain over the cool→warm gradient. Cards/fields stay flat and clean.
- Texture never sits behind body text smaller than 16px other than rail nav; never animated.

## Build tokens (light = default; dark via prefers-color-scheme, same roles)
| Role | Light | Dark |
|---|---|---|
| ink | #2B1E17 | #EFE9DB |
| ink-2 (secondary, ≥7:1) | #5A4A40 | #C9BFB2 |
| ground (gradient cool→lime→warm) | #E1E9E8 → #E8EBE4 → #EFE9DB | #1A1310 → #1E1612 → #231913 |
| surface / field | #F6F7F1 / #FBFBF7 | #2B1E17 / #33251D |
| rail (brick) / rail-ink | #9A3E24 / #FBF6EC | #6E2A17 / #FBF6EC |
| brass (fill, never text) / brass-tint | #C8963E / #F4E7C8 | #D4A24E / #3A2C1A |
| moss / moss-tint | #4E6B3C / #E4ECDA | #86A86F / #23301C |
| stone (paused) | #E7E4DA | #3A322B |
| line | rgba(43,30,23,.16) | rgba(239,233,219,.16) |
| focus ring | 3px #2B1E17 offset 2px | 3px #EFE9DB |
| danger text (delete only) | #8C2A1A | #F0A08F |

Type: Mukta 400/500/600/700, Kalam 400/700, **bundled locally** (`@fontsource/mukta`, `@fontsource/kalam`; no Google Fonts requests). Scale: 14 / 16 / 18 / 22 / 28 / 44. Radius: 4px frames, 10px buttons/inputs, no pill everywhere. Targets ≥44px. Motion: lattice leaf slides 500ms ease-out; `prefers-reduced-motion` → instant.
