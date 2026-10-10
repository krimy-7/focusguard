# Privacy Policy — DRAFT (not yet published)

> Draft for Krishna's review. To be published at the dashboard's `/privacy` (D-20) and kept in sync with the code. Every statement below must stay literally true; if the code changes, this changes in the same PR.

**Effective date:** _to be set on publication_ · **Contact:** _maintainer email_

FocusGuard AI is a browser extension and web dashboard that helps you get back to what you were working on. It is built by Krishna Nishad. This policy explains what FocusGuard AI handles, where it goes, and how to delete it.

## The short version

- **Your browsing activity never leaves your browser.** The extension looks at which site you're on to understand what you're working on, but page titles, page addresses (URLs), and your tab-by-tab activity stay on your computer.
- **Our server stores only:** your account email, your goals, the names of your contexts (like "Landing page design") with the *site names* that belong to them (like `figma.com`), your settings, and daily totals (like minutes focused and number of check-ins).
- **No ads, no selling data, no tracking or analytics tools.**
- **You can export or delete everything** from the dashboard's Settings at any time.

## What the extension observes (only after you click Start on the welcome screen)

| What | Used for | Leaves your computer? |
|---|---|---|
| The site name (domain) of your active tab | Deciding if you're on task, grouping related sites | Only the names of sites **inside a context** you've confirmed, as part of that context |
| The page title of your active tab (shortened; emails and long numbers removed) | Suggesting a context name, deciding if a new site is related | **No** — unless you turn on "Your API key" AI (see below) |
| Full page addresses (URLs) | Reopening your tabs when you resume | **No, never** |
| Whether you're idle or your screen is locked | Not nudging you when you're away | **No** |
| Which tabs are in a context's tab group | Bringing you back to the exact tab | **No** |

**Never observed:** what you type, page contents, form data, passwords, screenshots, incognito/private windows, and sites in sensitive categories (banking and payment such as eSewa and Khalti, health, password managers, private messaging, and government sites). You can add your own sites to this exclusion list in Settings.

## What our server stores

| Data | Why | How long |
|---|---|---|
| Account email (via our sign-in provider) | Signing you in | Until you delete your account |
| Goals you type | Your daily plan | Until you delete them or your account |
| Context names, mode (work/learning/personal), state, start/end times, site names | Showing your current context and history on the dashboard | Until you delete your account |
| Daily totals: focus minutes, number of check-ins, returns, breaks, longest detour | Your daily summary | Until you delete your account |
| Timezone and settings (grace period, quiet hours) | Making FocusGuard AI behave as you set it | Until you delete your account |

## AI features (optional, off by default)

FocusGuard AI does not run its own AI. You can choose:

- **Off** (default): nothing is sent anywhere for AI.
- **On-device:** uses the AI model built into Chrome on your computer. Nothing leaves your computer.
- **Local model:** uses a model running on your own computer (for example Ollama). Nothing leaves your computer.
- **Your API key:** the extension sends the **site name, the shortened page title, your context name, and today's goal titles** directly from your browser to the AI provider *you* chose, using *your* key. That provider's privacy policy applies to that data. Your key is stored only in your browser and is never sent to our server.

## Service providers

- **Supabase** (sign-in and database), hosted in Mumbai, India.
- **Google Cloud Run** (our server), Mumbai, India.
- **Google (Gmail)** to send sign-in codes by email.
- **Google** — only if you choose "Sign in with Google".

We don't share or sell your data to anyone else. We don't use it for advertising, and we don't use it to decide creditworthiness or for lending.

## Your controls

- **Export:** Dashboard → Settings → Export my data (a JSON file of everything we store about you).
- **Delete:** Dashboard → Settings → Delete my account removes all your data from our database and deletes your sign-in account.
- **Pause** FocusGuard AI anytime from the extension; uninstalling the extension removes everything it stored in your browser.

## Chrome Web Store Limited Use

The use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Browsing data is used only to provide FocusGuard AI's user-facing features described above, is not transferred except as described in "AI features" when you turn that on yourself, is not used for advertising, and is not read by humans except with your explicit consent (for example, if you send it to us for support).

## Changes

If this policy changes, we'll update the effective date and show a notice in the extension before the change applies.
