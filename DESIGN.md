---
name: FocusGuard AI
description: A carved Newari lattice window that quietly notices drift and helps you get back. Fired brick, sal-wood, lime-wash, brass and moss; a small calm Yeti looks out.
colors:
  ink: "#2B1E17"
  ink-2: "#5A4A40"
  cream: "#FBF6EC"
  ground-cool: "#E1E9E8"
  ground-lime: "#E8EBE4"
  ground-warm: "#EFE9DB"
  surface: "#F6F7F1"
  field: "#FBFBF7"
  stone: "#E7E4DA"
  stone-edge: "#8B7D70"
  brick: "#9A3E24"
  brick-joint: "#7E3019"
  brass: "#C8963E"
  brass-tint: "#F4E7C8"
  moss: "#4E6B3C"
  moss-hover: "#415C32"
  moss-tint: "#E4ECDA"
  danger: "#8C2A1A"
  placeholder: "#6A5B51"
  primary-hover: "#45322A"
  line: "rgba(43, 30, 23, 0.16)"
  frame: "#2B1E17"
  leaf-open: "#CFDDBF"
  leaf-wait: "#EBD6A0"
  leaf-paused: "#D9D5C9"
  lattice-groove: "#6E5445"
  private-pane: "#2B1E17"
  ink-dark: "#EFE9DB"
  ink-2-dark: "#C9BFB2"
  on-ink-dark: "#1A1310"
  ground-cool-dark: "#1A1310"
  ground-lime-dark: "#1E1612"
  ground-warm-dark: "#231913"
  surface-dark: "#2B1E17"
  field-dark: "#33251D"
  stone-dark: "#3A322B"
  brick-dark: "#6E2A17"
  brick-veil-dark: "rgba(20, 12, 8, 0.35)"
  brass-dark: "#D4A24E"
  brass-tint-dark: "#3A2C1A"
  moss-dark: "#86A86F"
  moss-hover-dark: "#9CBB86"
  moss-tint-dark: "#23301C"
  danger-dark: "#F0A08F"
  placeholder-dark: "#B3A799"
  primary-hover-dark: "#FBF6EC"
  line-dark: "rgba(239, 233, 219, 0.16)"
  edge-dark: "#B3A799"
  frame-dark: "#7A5C47"
  leaf-open-dark: "#3F5733"
  leaf-wait-dark: "#6B5128"
  leaf-paused-dark: "#4C4239"
typography:
  display:
    fontFamily: "Mukta, \"Nirmala UI\", system-ui, \"Segoe UI\", sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: "50px"
    letterSpacing: "-0.44px"
  display-sm:
    fontFamily: "Mukta, \"Nirmala UI\", system-ui, \"Segoe UI\", sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "34px"
    letterSpacing: "-0.2px"
  title:
    fontFamily: "Mukta, \"Nirmala UI\", system-ui, \"Segoe UI\", sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "34px"
    letterSpacing: "normal"
  heading:
    fontFamily: "Mukta, \"Nirmala UI\", system-ui, \"Segoe UI\", sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: "28px"
    letterSpacing: "normal"
  wordmark:
    fontFamily: "Mukta, \"Nirmala UI\", system-ui, \"Segoe UI\", sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "26px"
    letterSpacing: "normal"
  body:
    fontFamily: "Mukta, \"Nirmala UI\", system-ui, \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "normal"
  label:
    fontFamily: "Mukta, \"Nirmala UI\", system-ui, \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "22px"
    letterSpacing: "normal"
  button:
    fontFamily: "Mukta, \"Nirmala UI\", system-ui, \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: "1.2"
    letterSpacing: "normal"
  small:
    fontFamily: "Mukta, \"Nirmala UI\", system-ui, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "normal"
  hand:
    fontFamily: "Kalam, \"Segoe Print\", \"Bradley Hand\", cursive"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: "30px"
    letterSpacing: "normal"
  hand-field:
    fontFamily: "Kalam, \"Segoe Print\", \"Bradley Hand\", cursive"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: "26px"
    letterSpacing: "normal"
  hand-compact:
    fontFamily: "Kalam, \"Segoe Print\", \"Bradley Hand\", cursive"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.3"
    letterSpacing: "normal"
  # Nudge card only: the same bundled faces registered under private names (FontFace API) so host-page CSS can't collide.
  card-voice:
    fontFamily: "\"FocusGuard Mukta\", Mukta, system-ui, \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.3"
    letterSpacing: "normal"
  card-hand:
    fontFamily: "\"FocusGuard Kalam\", Kalam, \"Segoe Print\", \"Bradley Hand\", cursive"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.3"
    letterSpacing: "normal"
rounded:
  frame: "4px"
  chip: "6px"
  compact: "8px"
  control: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
  4xl: "56px"
  target: "44px"
  column: "720px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-back:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.cream}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-back-hover:
    backgroundColor: "{colors.moss-hover}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.cream}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  field-hand:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.hand-field}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  chip-site:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    rounded: "{rounded.chip}"
    padding: "5px 10px"
  pill-open:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.cream}"
    typography: "{typography.button}"
    rounded: "{rounded.chip}"
    padding: "3px 9px 2px"
  pill-wait:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.chip}"
    padding: "3px 9px 2px"
  pill-paused:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    typography: "{typography.button}"
    rounded: "{rounded.chip}"
    padding: "3px 9px 2px"
  rail:
    backgroundColor: "{colors.brick}"
    textColor: "{colors.cream}"
    typography: "{typography.label}"
    width: "232px"
    padding: "24px 16px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.cream}"
    typography: "{typography.label}"
    rounded: "{rounded.compact}"
    padding: "0 12px"
    height: "44px"
  nav-link-active:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "20px"
  window-open:
    backgroundColor: "{colors.moss-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.frame}"
  window-wait:
    backgroundColor: "{colors.brass-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.frame}"
  window-paused:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink}"
    rounded: "{rounded.frame}"
  notice-info:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    rounded: "{rounded.chip}"
    padding: "12px 16px"
  notice-try:
    backgroundColor: "{colors.brass-tint}"
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    rounded: "{rounded.chip}"
    padding: "12px 16px"
  plate:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.frame}"
  goal-row:
    textColor: "{colors.ink}"
    typography: "{typography.hand}"
    height: "60px"
  nudge-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "22px 14px 4px"
    width: "320px"
  snackbar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 4px 0 16px"
---

# Design System: FocusGuard AI

Recorded after the build, from the shipped code (extension CSS and `card.js`, dashboard `src/theme` and `src/components`) and the final review captures in `.impeccable/review/`. The direction contract is `.impeccable/surfaces/src-app.md` (seed f0d36cd3). Where the contract and the build differ, the build is recorded and the difference is noted.

## Overview

**Creative North Star: "The Tikijhyal Window"**

FocusGuard looks out through a carved Newari lattice window: it notices your drift, and you are never seen. Everything in the system is built from that one object. A dark-wood frame holds a sliding lattice leaf; the leaf's position says whether you are on task, being waited for, paused or private, and a small calm Yeti looks out from behind it. The shell around the window is fired brick laid in dachi-apa coursing, the ground is lime-wash plaster drifting from cool to warm, the ink is sal wood, and the only two signal colours are brass (waiting) and moss (on task, and the way back).

The system refuses two things: the category's soft-teal wellness-SaaS cards, and its neon "hardcore focus" opposite. It is quiet, carved and warm rather than glowing. Density is low: one reading column, one primary action per moment, generous 44px targets. Ornament is limited to the window; everything else is flat, bordered and legible. Depth comes from material (brick, plaster, wood) and tone, not from shadow.

The two surfaces share this world but are built separately: the **extension** (popup, settings, setup, injected nudge card, block page, Google sign-in tab) is plain HTML and CSS driven by `extension/styles/tokens.css`; the **dashboard** (`src/app`: sign-in, Today, History, Settings) is Expo Router with NativeWind, whose colour and type tokens live in TypeScript (`src/theme/index.ts`) and whose Tailwind config carries layout utilities only. Section "Components" lists where each piece lives on both.

**Key Characteristics:**
- One ornament, always meaningful: the lattice window carries state; it is never decoration.
- Fired-brick shell with fired-clay grain (never a flat fill); lime-wash ground with plaster grain; cards and fields stay flat.
- Sal-wood ink (never black); brass is a fill, moss is on-task and Back; nothing ever turns red except the delete-account zone.
- Two voices: Mukta for everything FocusGuard says, Kalam only for the user's own words. Both cover Devanagari and are bundled locally.
- Light by default, dark by system preference with the same roles; the block page is always warm-dark.
- Targets at least 44px, WCAG 2.2 AA, reduced motion makes the leaf instant.

### Cited adaptations

Departures from the direction contract that the build carries on purpose (source: `.impeccable/surfaces/src-app.md`, "Adaptations"):
- **The dashboard task window is read-only.** There are no Take a break / Pause buttons on the dashboard; the extension is authoritative for engine state and the backend is a mirror (DECISIONS D-12, D-15; v1 spec section 2, REST only, no command channel). Those actions live in the popup and the nudge card. A dashboard-to-extension command relay is v1.1 work.
- **The date sits under the Today sentence, not above it.** The craft floor bans kickers and eyebrows, so the page opens with the sentence and the date follows in ink-2.
- **The block page is forced warm-dark in both themes** (`data-theme="dark"` in `extension/blocked.html`): it is seen mid-distraction, often late.
- **Texture was added on the maintainer's decision of 2026-10-10** ("looked super plain"): brick under the rail and headers, plaster under the ground. Limits are in Elevation & Depth.

## Colors

A lime-wash ground, a fired-brick shell, sal-wood ink, and two signal colours borrowed from the window itself: brass for waiting, moss for on task. Dark mode keeps every role and shifts it to the `-dark` keys in the frontmatter. Light values are quoted here; the frontmatter is normative.

### Primary
- **Fired Brick** (#9A3E24): the shell. The dashboard rail and narrow-screen brand bar, every extension header, the app icon tile. Always rendered as brick coursing under grain, never as a flat fill. Dark scheme uses a veil over the same tile (`brick-veil-dark`); the flat dark value (`brick-dark`) only appears where textures are unavailable (native).
- **Sal-Wood Ink** (#2B1E17): text, control borders, the window frame, and the one primary button fill. Never `#000`.

### Secondary
- **Moss** (#4E6B3C): on task, and the way back. The Back button, the "on task" state, done checkboxes, History focus fill, the accent colour of form controls on extension pages. Hover is a darker moss (#415C32). Text on moss is cream (dark scheme: near-black).
- **Brass** (#C8963E): waiting. Pegs and stile of the lattice, the "waiting" pill, the underline on the key phrase of the day's sentence, selection, the ring around the pin-it art. A fill and a drawing colour only, never text (2.2:1 on the ground).

### Tertiary
- **Stone** (#E7E4DA): paused. The paused window pane, the paused plaque, the information notice, History plate bands, the disabled button fill (dashboard), the address-bar stand-in in setup. Its edge tone (#8B7D70) is the paused leaf's stile.
- **Danger Clay** (#8C2A1A): delete-account confirmation copy only. On the dashboard it colours the delete zone's border, heading, type-to-confirm field and button. The extension defines the token and does not use it.

### Neutral
- **Lime-Wash Ground** (#E1E9E8 at 0%, #E8EBE4 at 44%, #EFE9DB at 100%): a 160-degree gradient that drifts cool to warm under plaster grain. Dark scheme: #1A1310, #1E1612, #231913. Never a flat neutral grey or white.
- **Surface** (#F6F7F1) and **Field** (#FBFBF7): flat cards and inputs lifted a half-step off the ground by a 1px line, not a shadow. Dark: #2B1E17 and #33251D.
- **Ink 2** (#5A4A40): secondary text, 6.8:1 or better on every ground tone, 6.0:1 even under plaster grain. Dark: #C9BFB2.
- **Cream** (#FBF6EC): text on brick, on ink fills and on moss. Used identically in both schemes on brick.
- **Line** (`line`): the 16%-ink hairline for dividers and card borders. Control borders use full ink (dark: `edge-dark`) so they pass 3:1.
- **Brick Joint** (#7E3019): the mortar tone inside the brick tile; part of the texture, not a UI colour.

### Window tones
Each lattice state has a pane tint, a leaf colour and a stile colour: open (moss-tint, `leaf-open`, moss), waiting (brass-tint, `leaf-wait`, brass), paused (stone, `leaf-paused`, stone-edge), private (`private-pane`, same, brass). Dark values are the `-dark` keys. The lattice drawing itself is ink slats (3.2px) with a `lattice-groove` highlight line and a brass peg.

### Named Rules
**The Nothing-Turns-Red Rule.** State restyles in place: brass for waiting, moss for back. No error, warning or overdue state is ever red. Danger clay exists for the delete-account zone alone, and failed saves are a calm brass-tint notice that says what to do.

**The Brass-Is-a-Fill Rule.** Brass draws, fills and underlines; it never sets type. Any brass element that carries meaning also carries it in text, weight or shape (selected History plate: heavier border and label as well as the brass bar).

**The Sal-Wood Rule.** Ink is warm wood, never `#000`; the ground is never neutral. Pure white appears only in the Yeti's eye glints and the Google "G" tile, which Google specifies.

**The Moss Rule.** Moss means on task, done, or Back. It is not a decorative green and there is no second green.

## Typography

**Voice Font:** Mukta (400, 600, 700) with Nirmala UI, system-ui, Segoe UI as fallbacks
**Hand Font:** Kalam (400) with Segoe Print, Bradley Hand, cursive as fallbacks

**Character:** Mukta is a humane, Devanagari-capable sans that reads as FocusGuard speaking: plain, calm, slightly warm. Kalam is handwriting, reserved for the user's own words, so a goal or a break note is visibly theirs and never ours. Both ship with Latin and Devanagari subsets, bundled locally (extension `.woff2` files in `extension/fonts/`, dashboard TTFs via `@expo-google-fonts`); nothing is requested from a font CDN.

### Hierarchy
- **Display** (700, 44px, 50px line, -0.44px tracking): the dashboard Today sentence on wide screens. The key phrase carries a 6px brass underline, offset 5px, skip-ink off.
- **Display Small** (700, 28px, 34px, -0.2px): the same sentence on narrow screens (underline 4px, offset 3px), and loading titles.
- **Title** (700, 28px, 34px): page h1 (History, Settings, empty states, sign-in); also the extension h1 on settings, setup, sign-in tab and block page (line-height 1.2 there).
- **Heading** (700, 22px, 28px): section h2 on the dashboard and in extension settings; the task title when the window is closed or narrow.
- **Wordmark** (700, 18px): "FocusGuard AI" beside the window mark on every brick header.
- **Body** (400, 16px, 24px on the dashboard; 1.45 base, 1.35 popup, 1.3 nudge card in the extension): everything FocusGuard says. Reading measure 65ch on setup and settings, 720px column on the dashboard.
- **Label** (600, 16px, 22px): field labels, nav labels, selected History day.
- **Button** (700, 16px, 1.2): extension buttons and state pills.
- **Small** (400, 14px, 20px): secondary lines, chips, counts, bottom-tab labels. Nothing in the system is smaller than 14px.
- **Hand** (Kalam 400, 22px, 30px): goals on the dashboard. **Hand Field** (18px, 26px): the dashboard add-goal input. **Hand Compact** (16px): break notes, task-name inputs and the welcome-back note in the popup and nudge card.

### Named Rules
**The Two Voices Rule.** Mukta for everything FocusGuard says; Kalam only for words the user typed or will read back as their own (goals, break notes, task names in inputs). Never Kalam for UI chrome, never Mukta for a goal.

**The One Size Rule.** The popup and the nudge card use a single 16px size; rank is carried by weight (400 / 600 / 700), reversal (filled versus outlined) and case only. This is enforced in the popup by `.popup *:not(svg) { font-size: 1em }`.

**The Bundled Rule.** Fonts are local files with `unicode-range` splits, so the browser fetches Devanagari only when it is needed. The injected nudge card registers them under private family names (`FocusGuard Mukta`, `FocusGuard Kalam`) so no host page's CSS can collide, and shows itself once they load, raced against 150ms.

## Layout

A single reading column on a textured ground, with brick framing it. The shared breakpoint is 960px: at and above it the dashboard shows the 232px brick rail on the left and the extension's setup page becomes three columns; below it the dashboard drops to a 60px brick brand bar on top and a bottom tab bar (56px targets), and setup stacks.

- **Dashboard page:** content column max 720px, centered; padding 56px wide / 20px narrow; vertical gap 40px wide / 32px narrow; bottom padding 72px plus the safe-area inset. Today reads top to bottom: the day's sentence (display, brass key phrase), the date line, the task window with its extension-status line, today's goals, the add-goals card. History: title and one explanatory line, seven plates in a row (gap 12px wide / 6px narrow), then the selected day's card. Settings: title, then hairline-separated sections (28px top padding, 12px internal gap); only the delete zone is boxed.
- **Popup:** 360px wide, never taller than 600px (Chrome's cap); 60px brick header, scrolling body with 16px padding and 12px gaps, fixed footer holding "Open dashboard". One primary at a time: Back to {task} (a check-in is showing), Resume (on a break), Turn check-ins back on (paused), or Yes, track it (a proposal).
- **Settings page (extension):** 640px column, h1 28px, sections separated by hairlines (28px padding), list rows 52px.
- **Setup page:** max 1180px, three columns at 960px and up (1.05fr / 1.1fr / .95fr, 24px row gap, 48px column gap): the promise and a faithful preview of the real check-in card, three plain facts, then choices and the pin-it art. Facts are a definition list separated by hairlines, not cards.
- **Block page and Google tab:** centered 460px and 480px columns under a brick header (72px and 64px).
- **Nudge card:** fixed 16px from the bottom-right corner, 320px wide (never wider than the viewport minus 32px), above everything (`z-index` max), never blocking, never taking focus.
- **Spacing rhythm:** 4, 8, 12, 16, 24, 32, 48, 56. Rows and controls are 44px tall at minimum (dashboard fields 48px, goal rows 60px). Text over 65ch is held to a measure.
- **History plates compare by shape:** every plate is the same size and the same scale (full height is 6 hours of focus; each brass dot is one check-in, at most 9), so days read against each other with no totals ranked and no score.

### Named Rules
**The One Primary Rule.** At any moment a view has one primary action. Everything else is outlined or a text link. If two things want to be primary, one of them is not.

**The Same Scale Rule.** Anywhere days, sessions or counts are compared, they share one fixed scale and shape. No score, no streak, no ranking, no "minutes wasted".

## Elevation & Depth

The system is flat and tonal, with material carrying depth: coursed brick, plaster grain, carved frames. Resting surfaces (cards, fields, plates, notices) have a 1px line and a half-step tone, never a shadow. Shadows exist only where something genuinely floats above a surface that is not ours.

### Shadow Vocabulary
- **Nudge-card lift** (`box-shadow: 0 0 0 1px var(--line), 0 14px 34px var(--lift)`; lift is 32% ink in light, 55% black in dark): the injected check-in card, which floats over someone else's page. Reproduced in the setup-page preview.
- **Undo snackbar lift** (`box-shadow: 0 8px 20px rgba(43,30,23,0.28)`): the dashboard's calm undo toast, ink on cream, bottom of the page. Native uses `shadowOpacity .28, radius 12, offset 0/6`.
- **Rail inner shade** (`inset -6px 0 10px -6px rgba(43,30,23,.55)` on the right edge; `inset 0 6px 10px -6px` on the bottom tab bar's top edge): the soft inner shadow on the brick's content-facing edge.
- **Header hairline** (`box-shadow: 0 1px 0 rgba(43,30,23,.35)`): the extension brick header's lower edge.
- **Engraved wordmark** (`text-shadow: 0 1px 0 rgba(43,30,23,.35)`): cream text on brick only (wordmark, popup title, inactive rail nav labels), so it reads like cut into the brick. Not a general text style.
- **Window hairline** (`inset 0 0 0 1px rgba(200,150,62,.55)`): the brass line just inside every window frame.
- **Pin ring** (`0 0 0 3px brass`): the setup page's "click here" ring on the pin-it art.

### Texture recipes
- **Fired brick** (`extension/brand/brick.svg`, 96 x 40 tile; coursing of #9A3E24-family bricks, half bond, #7E3019 hairline joints) under **fired-clay grain** (`grain.svg`, 180 x 180 tile, `background-blend-mode: multiply`). Applies to the dashboard rail and brand bar, the bottom tab bar, and every extension header (`.brick`). Dark adds a veil over the tile.
- **Lime-wash plaster** (`plaster.svg`, 240 x 240 tile, fractal noise at most 7% alpha) over the 160-degree ground gradient. Applies to the page ground on both surfaces. Native falls back to the flat middle tone.
- **Provenance:** the three SVGs in `extension/brand/` are canonical. The dashboard embeds them verbatim in `src/theme/textures.ts`, and `src/theme/textures.test.mjs` fails if the strings drift from the files.
- **Contrast limits:** cream text on the lightest brick tile (#A3452A) is 5.7:1 before grain, 6.3:1 on the base brick, and the multiply grain only darkens it; with the dark veil it is above 9:1. Ink-2 on the ground stays at or above 6.0:1 under the densest plaster. Any new texture must keep these floors, and cream text on brick must stay at or above 5:1 on every tile.

### Named Rules
**The Texture Ceiling Rule.** Texture lives on the shell (brick) and the ground (plaster) only. Cards, fields, plates, notices, buttons and the window pane stay flat and clean. Running body copy never sits on brick; only wordmarks, nav labels and the rail's one privacy line (all 16px or larger) do. Secondary 14px lines may sit on the plaster ground only in ink or ink-2 (6:1 or better). Texture is never animated and never carries information.

**The Carved-Not-Floating Rule.** A resting surface gets a line, not a shadow. A lift is allowed only for the card that floats over a foreign page and the undo toast. New components inherit the line.

## Shapes

Soft but not pillowy: carved frames are nearly square, controls are gently rounded, and nothing is a pill. Corners are 4px (frames, plates, the stone plaque is 3px), 6px (chips, notices, pills, checkboxes), 8px (rail links, icon buttons, the compact nudge-card buttons) and 10px (buttons, fields, cards, disclosure rows, the nudge card).

- **The window frame** is the signature shape: a 5px sal-wood frame with an 8px sill on the bottom edge (3px / 5px for the 44px mark, 4px / 6px for the medium Yeti window), a 1px brass hairline inside, and a leaf whose edge is a coloured stile (5px; 3px on the mark).
- **Borders:** controls and plates use 1.5px or 2px ink; cards and chips use the 1px line. The selected History plate steps from 2px to 3px.
- **Dots:** 10px circles in moss, brass or ink-2 accompany a state label on the dashboard.
- **Icons:** authored 24px line icons, one 2px round-capped stroke, inline SVG (today, history, settings, arrow, external, close, check, info). Icons are decorative and hidden from assistive tech; the control carries the label.

### Named Rules
**The One Ornament Rule.** The lattice window is the only ornament, and it always carries state. No decorative lattice borders, dividers or backgrounds.

**The Stile Stays on the Leaf Rule.** A coloured edge stripe is the lattice leaf's stile and nothing else. Cards, notices, list rows and callouts do not get a coloured side border.

## Components

Components are character lines first. Both surfaces are listed with their implementation: the extension uses CSS custom properties from `extension/styles/tokens.css`; the dashboard reads `useTheme()` from `src/theme/index.ts` (the same roles, duplicated in TypeScript, plus `src/global.css` for web-only chrome). `tailwind.config.js` carries layout utilities only and defines no colour.

### The Lattice Window (signature)
One geometry for art and state. A carved frame holds a pane and a sliding lattice leaf; the leaf's position and the pane's tint say what FocusGuard is doing. It slides over 500ms, easing out.

| State | Meaning | Pane / leaf / stile | Leaf position |
|---|---|---|---|
| open | on task, watching | moss-tint / leaf-open / moss | pushed aside, only the jamb shows (11px mark, 28px popup, 30px hero, 22px md, 56px or 36px dashboard window) |
| wait | grace, or a check-in showing | brass-tint / leaf-wait / brass | 60% across (70% in the narrow dashboard window) |
| paused | paused, on a break, nothing tracked | stone / leaf-paused / stone-edge | closed |
| private | not looking (sensitive site) | private-pane / private-pane / brass | closed, finer brass grille (9px tile), pane hidden |

- **Where it lives.** Extension: `.win` and `[data-state]` rules in `extension/styles/tokens.css` (`data-state` open | wait | paused | private; sizes `win--mark` 44x44, `win--hero` 112x92, `win--card` in `extension/popup/popup.css`; lattice art from `extension/brand/lattice.svg`). Dashboard: `LatticeWindow` in `src/components/brand.tsx` (`state` open | wait | paused | private; `size` mark | md | lg), colours in `src/theme/index.ts` (`win`, `slat`, `frame`), lattice drawn with `react-native-svg` patterns.
- **Closed windows put words on a plate** so type never sits on carving: the popup uses a stone plaque (12px margin, 3px radius); the dashboard uses a surface plate (4px radius, 1px line). Open and waiting windows keep text clear of the leaf by padding.
- **State mapping.** Extension (`popup/model.js windowState`): `active` is open; `grace`, `intervened_l1`, `escalated_l2` are wait; paused, `on_break`, idle and a proposal are paused. Dashboard (`task-window.tsx WINDOW`): `detected` and `active` are open; the grace and check-in states are wait; `on_break`, `ended` and no task are paused.
- **Labels beside the window.** Popup: a filled pill under the title (On task, Waiting, Checking in, On a break, Paused, Just noticed, Not tracking). Dashboard: a 10px dot and a label (In focus, On a short detour, Checked in, Checked in twice, On a break, Wrapped up, Just noticed). The state is always also in the window's accessible name ("Current task: ...").
- **Motion.** Leaf 500ms ease-out; pane fade 350ms; the closed plate fades in after the leaf (300ms delay) and out fast (120ms); the Yeti fades with a 150-250ms delay. The popup's first render runs from the shut position, so opening is seen once; the hero window on setup and the Google tab slides open once on arrival (900ms, 250ms delay). Under `prefers-reduced-motion: reduce` every transition and animation is off; the dashboard also reads the OS setting and sets the leaf directly.

### The Yeti
A small, calm companion in bust view: cream fur with a sal-wood outline, pale face, one gentle expression, a brass scarf. Original character, never a real person's likeness.
- **Source of truth:** `extension/brand/yeti.svg`. The dashboard redraws the same geometry in `YetiMark` (`src/components/brand.tsx`); the nudge card inlines it in `extension/nudge/card.js`; the setup preview references the file. Copy the geometry; do not redraw or restyle it.
- **He looks out of a window.** He always appears inside a lattice window or as the app icon (brick tile, cream window, Yeti, brass-stiled leaf; rasters come from `src/tools/make-icons.mjs`, extension toolbar icons in `extension/icons/`). He is never free-floating, never in a speech bubble, never on a red surface, and he does not change expression: state is carried by the leaf, not his face.
- **Sizes:** 34px in the 44px brand mark (every brick header), 28px in the nudge-card tab, 68px peeking over the sill of the popup task window, 52px (md) and 76px (lg, 56px narrow) on the dashboard, 78px in the hero window. At most one illustrated Yeti per content view; header marks do not count.
- **He sits beside the words, under the leaf.** In the open window he peeks over the sill to the right of the text; when the leaf closes over him he disappears. The mark's pane stays cream in both themes, like the app icon. His fur colours never change with the scheme.

### Buttons
Quiet and solid, never loud. Corner 10px, minimum height 44px (50px for the Google sign-in), 1.5px border, 16px horizontal padding, label in Mukta 700 on the extension.
- **Primary** (ink fill, cream text; dark scheme inverts): the one primary action. Hover darkens (`primary-hover`) in the extension; the dashboard dims to 90% opacity, 80% pressed.
- **Back** (moss fill, cream text): the way back, in the popup, nudge card, block page. Hover `moss-hover`. There is no Back button on the dashboard (read-only task window).
- **Quiet / default** (transparent, 1.5px ink border): everything else. Hover tints 8% ink (dark 10%).
- **Ghost** (no border, underlined label, 600): "Not now", "Use a different email", "Start something new". On the dashboard the equivalent is a `TextLink` (underlined label) in Settings and sign-in.
- **Danger** (danger-clay fill): dashboard delete-account only; enabled only after typing DELETE.
- **Disabled:** extension at 55% opacity with `not-allowed`; dashboard swaps to a stone fill, no border and ink-2 text.
- **Focus:** a 3px ink ring (dark: cream; cream on brick), offset 2px, on every focusable element on both surfaces.
- **Where:** `.btn`, `.btn.primary`, `.btn.back`, `.btn.ghost`, `.btn.block` in `extension/styles/tokens.css`; `Button` (`tone` primary | quiet | danger) in `src/components/button.tsx`; nudge-card buttons are re-declared inside `card.js` (8px corners, because the card is injected into other sites and carries its own copy of the tokens).

### Inputs / Fields
- **Style:** field tone background, 1.5px ink border (3:1 or better), 10px corner. Extension minimum height 44px with 12px side padding; dashboard 48px with 14px side padding.
- **User-typed fields** (goals, break note, task name, proposal title) use Kalam (`hand`); everything else Mukta. Placeholders use the `placeholder` tone (6.3:1).
- **Focus:** the 3px ring. The caret is moss on extension pages and ink on the dashboard and in the nudge card.
- **Errors:** inline beside the action, never at the top of the page. A failed save is a brass-tint notice ("... Nothing was saved."). The delete field alone takes a danger-clay border.
- **Where:** global input rules in `tokens.css`; `Field` (`hand` prop) in `src/components/field.tsx`.

### Chips, pills and notices
- **Site chip:** surface fill, 1px line, 6px corner, 14px text, 5/10px padding. Dashboard task window sites (`task-window.tsx`); setup page example sites (`onboarding.css .sites li`).
- **State pill:** popup only (`.pill`): filled in the state's colour (moss, brass, ink), bold 16px, sentence case, under the title and never above it.
- **Notice:** calm inline message in a 6px-cornered band. Stone for information (offline, signed out), brass-tint for "that did not work, here is what to do"; an icon, one sentence, an optional action. `Notice` in `src/components/notice.tsx` (`tone` info | try; `urgent` makes it an alert); `.fb.problem` in the extension.
- **Disclosure row:** surface fill, 1px line, 10px corner, 44-48px high, label left, current value and a chevron right (Beast Mode in the popup, Optional AI help in setup; `.beast`, `.ai`).

### Cards / Containers
- **Corner Style:** 10px. **Background:** surface (flat). **Border:** 1px line. **Shadow:** none (see Elevation & Depth). **Internal padding:** 20px narrow, 28px wide on the dashboard; 24px on the sign-in card.
- Settings sections and setup facts are hairline-separated blocks, not cards; do not nest cards.

### Navigation
- **Rail (dashboard, wide):** 232px of brick, wordmark with the window mark at the top, three links (Today, History, Settings) at 44px, a hairline and the line "Page titles and full addresses never leave your browser." at the foot. The active link is a cream fill with ink text and `aria-current="page"`; inactive links are cream text with the engraved shadow; hover is a 14% white wash.
- **Brand bar and bottom tabs (dashboard, narrow):** a 60px brick bar, and a brick bottom tab bar with 56px stacked icon-and-label targets.
- **Extension headers:** `.brick.head`, 64px (popup 60px, block page 72px), window mark, wordmark; the popup adds a 44px settings icon button on the right.
- **Where:** `src/components/nav.tsx` (`Nav`, `NavLink`, `BrandBar`) and `src/components/surfaces.tsx` (`BrickRail`); `src/app/(tabs)/_layout.tsx`; the extension's `.head`, `.name`, `.iconbtn`.

### The Nudge Card
A folder-tab card in the corner of whatever page you drifted to. It never blocks, never steals focus, never startles. Escalation gets quieter: the second check-in uses the same card with softer words.
- **Shape:** 320px, surface fill, 10px corner, the nudge-card lift. A tab (40px high, 10px top corners) holds the window mark and "FocusGuard AI". The tab's outline stops at the card edge.
- **Content:** one message line at 16px, a row of three buttons (Back in moss, +5 min, Break; columns 1 : 1.1 : 1), two quiet text links (This is part of my task, Why this?), a 28px close mark with a 44px hit area. "A new task" and "Break" open inline panels; Esc closes a panel, then the card, but never throws away typed text.
- **Welcome-back variant:** the user's own note on top in Kalam, the message, the sites you were on, and a single primary "Got it".
- **Behaviour:** built in a closed shadow root with its own copy of the tokens (`card.js`, light default, dark by `prefers-color-scheme`); fades in over 200ms and the leaf settles over 500ms, both only under `prefers-reduced-motion: no-preference`; announced politely through a live region after 100ms.
- **Where:** `extension/nudge/card.js` (injected, self-contained), previewed statically in `extension/onboarding/onboarding.html` with `.nudge` rules in `onboarding.css`.

### Component inventory

| Component | Dashboard (`src/`) | Extension (`extension/`) |
|---|---|---|
| Tokens | `theme/index.ts` (`LIGHT`, `DARK`, `TYPE`, `RADIUS`, `LIFT`), `global.css` (web chrome), `tailwind.config.js` (layout only) | `styles/tokens.css` (all roles, fonts, base) |
| Textures | `theme/textures.ts`, `components/surfaces.tsx` (`Ground`, `BrickRail`) | `brand/*.svg`, `.brick` and `body` in `tokens.css` |
| Lattice window | `components/brand.tsx` (`LatticeWindow`) | `.win*` in `tokens.css`, `popup/popup.css` (`win--card`) |
| Yeti | `components/brand.tsx` (`YetiMark`) | `brand/yeti.svg`, `nudge/card.js` |
| Text | `components/app-text.tsx` (`AppText`, `tone`, `variant`) | base `body`, `.muted`, `.hand`, `.sr-only` |
| Buttons | `components/button.tsx` | `.btn` family in `tokens.css` |
| Fields | `components/field.tsx` | input rules in `tokens.css` |
| Navigation | `components/nav.tsx`, `app/(tabs)/_layout.tsx` | `.head`, `.iconbtn` |
| Task window | `components/task-window.tsx` (`TaskWindow`, `ExtensionStatus`, `Welcome`) | popup `#ctxWin` in `popup/popup.html` and `popup.css` |
| Goal row | `components/goal-row.tsx` | not present (goals are dashboard-only) |
| History plate and totals | `app/(tabs)/history.tsx` (local `Plate`, `Totals`) | not present |
| Notice | `components/notice.tsx` | `.fb`, `.fb.problem`, `.disclosure` |
| Page and ground | `components/page.tsx`, `surfaces.tsx` | `body`, `.page`, `.grid`, `.policy` |
| Empty and first-run | `components/empty-state.tsx`, `task-window.tsx` (`Welcome`) | `onboarding/onboarding.html` |
| Snackbar | `components/snackbar.tsx` | not present |
| Icons | `components/icon.tsx` | inline `<svg class="ico">` |
| Settings sections | `app/(tabs)/settings.tsx` (local `Section`, `TextLink`) | `popup/options.html`, `options.css` (`.sect`, `.list`, `.radio`, `.disclosure`) |
| Sign-in | `app/sign-in.tsx` | `popup/popup.html` (signed-out view), `auth/google.html` |
| Nudge card | not present | `nudge/card.js` |
| Block page | not present | `blocked.html` (script `beast/blocked.js`) |
| Setup and privacy | not present | `onboarding/onboarding.html`, `privacy.html`, `onboarding.css` |

### Screens and their composition
- **Today:** sentence, date, task window plus extension status, goals in Kalam with check, tap-to-edit and remove (60px rows, hairline separators), add-goals card, undo snackbar.
- **History:** seven plates (2px ink border, stone band with brass dots, moss fill), selected day's story sentence and a plain totals table (Focus time, Check-ins, Came back on your own, Times you got back on track, Extra time taken, Breaks, Longest detour).
- **Settings:** Account, Grace before a check-in (radio group of 2, 5, 10 minutes as outlined 84px buttons that invert when selected), Quiet hours, Timezone, Your data, Delete my account (boxed, danger clay).
- **Popup:** brick header, the task window, one primary at a time, break note, Take a break and Pause (30 minutes, until tomorrow, until turned back on), Start something new, Beast Mode row, Open dashboard.
- **Block page:** brick header, hero window (waiting), "{site} can wait.", Back to {task} (moss), "Open for 10 min" disabled for 10 seconds with a countdown announced twice.

## Do's and Don'ts

### Do:
- **Do** draw state with the lattice window: moss pane and open leaf for on task, brass pane and half-closed leaf for waiting, stone and a closed leaf for paused, a fine brass grille for private.
- **Do** keep the shell as brick under grain and the ground as plaster over the cool-to-warm gradient; keep cards, fields and plates flat with a 1px line.
- **Do** set ink at #2B1E17 (dark #EFE9DB) and let the ground drift cool to warm; keep cream text on brick at 5:1 or better on every tile.
- **Do** use one primary action per view, Back in moss when a check-in is showing, and keep every target at 44px or taller.
- **Do** set the user's own words in Kalam and everything FocusGuard says in Mukta; both must render Devanagari.
- **Do** let reduced motion make the leaf instant, and keep texture still.
- **Do** put a window mark and wordmark on every brick header, and reuse the Yeti and lattice geometry from `extension/brand/` rather than redrawing it.
- **Do** compare days at one fixed scale, and phrase every count as a plain fact.
- **Do** keep nothing under 14px, and 16px in the popup and nudge card.

### Don't:
- **Don't** turn anything red outside the delete-account zone: no error banners, overdue states, or red badges.
- **Don't** use brass for text, or use a second green; brass is a fill and moss is on-task or Back.
- **Don't** put texture behind cards, fields, buttons, or the window pane, or animate it.
- **Don't** add shadows to resting surfaces; a lift belongs only to the floating nudge card and the undo toast.
- **Don't** add a coloured side border to cards, notices or list rows; the stile belongs to the lattice leaf.
- **Don't** use `#000`, neutral grey grounds, or pure white fills (the Yeti's eye glints and Google's "G" tile are the only whites).
- **Don't** put eyebrows, kickers or all-caps labels above headings; the system has none. The date and other meta lines sit under the heading, in ink-2.
- **Don't** use glyph or emoji icons; icons are authored inline line SVG.
- **Don't** load fonts or images from a CDN, add decorative lattice borders, or make the Yeti emote, speak, or appear outside a window.
- **Don't** add scores, streaks, rankings, or "minutes wasted" to any surface.

### Copy in the interface
- **Do** write sentence case, plain and warm: a supportive friend, never a coach. One short sentence and one action beat a paragraph.
- **Do** make Back the primary verb of a drift moment, and name the user's own task in it ("Back to Landing page redesign").
- **Do** say "task" in user-facing copy; use "context" only where Settings names the tracked thing. Say "check-in" for the nudge, "detour" for drift, "break" for a break, "Beast Mode" as a proper noun.
- **Do** say what happened and what to do on errors, and end failed saves with "Nothing was saved."
- **Do** make escalation gentler, not louder ("No rush. Back to {task} whenever you're ready.").
- **Do** state privacy literally and where it matters ("Page titles and full addresses never leave your browser."); sites are named by host only.
- **Don't** use the words lazy, failed, wasted, "distracted again", "you should have", disappointing; don't compare the user with others or personify the task as hurt or abandoned.
- **Don't** use urgency, exclamation marks, or guilt framing; don't show a count as a judgement.
- **Don't** show raw technical errors ("Failed to fetch") to the user.
