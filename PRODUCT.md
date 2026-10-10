# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Two web surfaces: a Chrome MV3 extension — popup, onboarding/consent page, injected corner nudge card, Beast Mode block page — and a web dashboard built with Expo Router and exported for web. A native mobile companion is planned for v1.1 and out of scope now.)

## Users

Students and developers in Nepal and India (English UI; Nepali later), many with ADHD or who struggle with attention. They work in the browser — lectures, docs, code, design tools — and lose their place after interruptions: a "quick" YouTube video, a Reddit spiral, a break that runs long. Their job: get back to what they meant to do, without rebuilding context from memory and without feeling judged.

## Product Purpose

FocusGuard AI notices when you drift from the task you're on, waits a grace period before saying anything, nudges gently, and helps you resume exactly where you left off (your task's tabs as a Chrome tab group, your own one-line note shown first on return). The dashboard holds today's typed goals, the current context, and a short kind story of the day. Success is the user returning to their task more often and more easily — not time-on-screen or streaks.

## Positioning

Built for *getting back*, not blocking. Most self-control tools block sites; tab managers save context but never notice drift. FocusGuard AI connects what you said you're doing → noticing drift with patience (grace, momentum-aware) → a resumption cue with your own note. Privacy is structural: browsing activity never leaves the browser.

## Operating Context

- The nudge card appears on whatever page the user drifted to, mid-distraction, often in a low-self-control moment; it must never block, steal focus, or startle.
- The popup is opened briefly from the Chrome toolbar; Chrome caps popup height around 600px.
- The dashboard is opened occasionally (morning goals, evening reflection), often late — default quiet hours start at 22:00.
- Distribution is GitHub Releases ("Load unpacked"), so first run includes Developer-mode install and pinning the extension.
- Connections in the target region can be slow or flaky.

## Capabilities and Constraints

- Detect-first contexts (proposed from activity, soft-confirmed after 90 s, editable); tiers green/yellow/red/sensitive; grace 5 min default, shorter at high momentum; ≤3 nudges per hour; quiet hours; pause; breaks with a note; Beast Mode (opt-in site blocking with "continue anyway").
- Nudge actions: Back · "This is part of my task / a new task" · +5 min · Break.
- AI is bring-your-own and off by default (Off / on-device / local model / your key).
- Sign-in: Google first, email 6-digit code second (Supabase Auth).
- Never on the server: page titles, URLs, raw events, resume targets, AI keys. Server stores goals, context names with site names, settings, daily totals.
- Terminology in use: context, grace, check-in, Beast Mode, break, welcome back. "Context" vs "task" is currently inconsistent across surfaces (open decision).
- Undecided: Nepali copy timing; whether escalation ever uses a second nudge at all.

## Brand Commitments

- Name: **FocusGuard AI**.
- Mascot: a **small Yeti — a calm companion**: gentle, unhurried, Himalayan; sits beside you, reassures, never judges, rarely jokes. Original character (never a real person's likeness).
- Voice: supportive friend — warm, plain-spoken, never shaming. Banned in any copy: lazy, failed, wasted, distracted again, you should have, disappointing, guilt framing, comparisons to others, personifying the task as hurt or abandoned.
- Escalation gets **quieter, not louder**.
- No scores, no "minutes wasted", no broken-streak guilt.
- No ads, no tracking SDKs.

## Evidence on Hand

- Research summaries with citations: `docs/research/2026-10-10-focus-recovery-research.md` (interruption/resumption, nudges and attrition, ADHD design, competitors), plus platform/auth research in `docs/research/`.
- No users, testimonials, metrics, press or awards exist yet — future surfaces must not invent any.

## Product Principles

1. Grace before intervention; never punish ambiguity.
2. The user's own words beat our inference (their note, their confirmation, "this is part of my task").
3. Escalate in tone toward calm, never in force; only the user turns on blocking.
4. Privacy is a property of the architecture, stated plainly and literally true.
5. Getting back is the product; numbers appear only where they help self-understanding.

## Accessibility & Inclusion

WCAG 2.2 AA (contrast, keyboard, screen reader, 44px targets) plus ADHD-aware, low-stimulation rules: respect reduced motion, no flashing or urgency cues, one primary action per moment, progressive disclosure, dark mode, nothing that steals focus. Fonts must cover Devanagari for Nepali/Hindi goal text.
