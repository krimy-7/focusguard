# FocusGuard: auth + hosting research brief

Date: 2026-10-10. Scope: auth for 3 clients (Chrome MV3 extension, Expo web dashboard, later Expo Android/iOS) talking to the FastAPI backend, plus hosting for FastAPI and Postgres.
Method: official docs and pricing pages, all checked on **2026-10-10**. "(unverified)" means I could not confirm the claim from the vendor's own page. "(not re-checked)" means I know it from prior experience but did not reopen the source today. Prices change often, so re-check before paying.

Grounding: today `backend/app/models.py` has no `user_id` on any table. `main.py` allows `chrome-extension://*` via CORS. `src/lib/api.ts` and `extension/background.js` send no `Authorization` header. Whichever option you pick, Phase 1 needs the same three changes: a `user_id` column on every table, a FastAPI dependency that turns a bearer token into `user_id`, and a filter on every query.

## TL;DR

**Auth: Supabase Auth (free plan) with email OTP codes and Google.** FastAPI verifies the tokens itself using a public key set (JWKS).
- **Free limit.** 50,000 MAU ([pricing](https://supabase.com/pricing)).
- **Standard tokens.** Access tokens are signed with asymmetric ES256 keys. FastAPI checks them with PyJWT against `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` ([signing keys](https://supabase.com/docs/guides/auth/signing-keys)).
- **Extension login works without redirects.** The 6-digit email OTP code can be typed straight into the extension popup ([passwordless](https://supabase.com/docs/guides/auth/auth-email-passwordless)). Supabase's own Google guide has a Chrome-extension section that uses `chrome.identity.launchWebAuthFlow` ([Google login](https://supabase.com/docs/guides/auth/social-login/auth-google)).
- **Region.** Projects can live in Mumbai (`ap-south-1`) ([regions](https://supabase.com/docs/guides/platform/regions)).
- **Low lock-in.** The auth server is open source and the tokens are standard JWTs.
- **Required extra: custom SMTP.** The built-in mailer sends only **2 emails/hour, and only to your own team's addresses** ([SMTP](https://supabase.com/docs/guides/auth/auth-smtp)). Plug in Resend's free tier (3,000/month, 100/day) ([Resend](https://resend.com/pricing)).

**Auth runner-up: roll your own email-OTP + JWT in FastAPI.** It needs no vendor and keeps all data in your database. The catch is that you own all the security work: rate limits, hashing, refresh rotation and abuse handling. Pick it if Supabase's terms or availability become a problem. Clerk has the best extension SDK, but it can't do OAuth from the popup and has weaker Expo-web support (details below).

**Hosting: FastAPI on Google Cloud Run (`asia-south1`, Mumbai) plus Supabase Postgres in the same Supabase project as auth (Mumbai).**
- **Cost.** Cloud Run's free tier is 2M requests, 180k vCPU-s and 360k GiB-s per month ([Cloud Run pricing](https://cloud.google.com/run/pricing)).
- **No sleep problem in practice.** Instances scale to zero, but frequent extension pings keep one warm.
- **Same-DB bonus.** FastAPI can read `auth.sessions` to check instantly whether a user has logged out.
- **WebSockets work, with limits.** Connections last at most 60 min, and an open socket bills as instance time ([WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets)). For v1.1 sync, prefer polling or Supabase Realtime (free plan: 200 concurrent connections, 2M messages/month ([pricing](https://supabase.com/pricing))).

| Users | Cloud Run | Supabase | Email | **Total/month** |
|---|---|---|---|---|
| 0 | $0 | $0 (Free) | $0 | **$0** |
| 100 | $0 (inside free tier, est.) | $0 | $0 | **$0** |
| 1,000 | ~$10–20 (est., see below) | $25 Pro (for backups and no pausing) | $0–20 | **~$35–65** |

Estimate assumptions: 300–500 API calls per user per day, about 30 ms CPU per call, a 512 MiB instance, and Tier-1 rates of $0.40/M requests and $0.000024/vCPU-s. `asia-south1` may bill at a higher tier (unverified). The Supabase Free plan has **no automatic backups**, and inactive projects pause after one week ([pricing](https://supabase.com/pricing)). Pro is $25/month and includes $10 of compute credit.

**Hosting runner-up: Railway Hobby, $5/month flat, Singapore region.**
- $5 of usage is included each month. The service is always on and does not sleep unless you opt in to "Serverless" ([pricing](https://railway.com/pricing), [app sleeping](https://docs.railway.com/reference/app-sleeping), [regions](https://docs.railway.com/reference/deployment-regions)).
- It's the choice if Google billing won't accept your card. Cloud Run needs a billing account even on the free tier, and whether a Nepali card works there is unverified.
- Totals: about $5 at 0 and 100 users, and about $5–15 at 1,000 users plus Supabase Pro (est.).

---

## 1. Auth comparison

### 1a. Quick table

| | Supabase Auth | Clerk | Firebase Auth | Better Auth | Auth0 | Stytch | Roll our own |
|---|---|---|---|---|---|---|---|
| **Free tier** | 50k MAU | 50k MRU/app (MRU = users who return at least one day after signing up) | 50k MAU | Free (MIT library, self-host) | 25k MAU | 10k MAU | Free (pay for email only) |
| **Next step** | Pro $25/mo: 100k MAU, then $0.00325/MAU | Pro $25/mo ($20 if billed annually): 50k MRU, then $0.02/MRU | Google Cloud rates after 50k | Your hosting | Essentials $35/mo for only 500 MAU | Per-MAU, rate not listed | — |
| **Source** | [link](https://supabase.com/pricing) | [link](https://clerk.com/pricing) | [link](https://firebase.google.com/pricing) | [link](https://www.better-auth.com/docs/plugins/jwt) | [link](https://auth0.com/pricing) | [link](https://stytch.com/pricing) | — |
| **Google sign-in** | Yes | Yes (Free plan allows 3 social providers) | Yes | Yes | Yes | Yes (unverified on pricing page) | Yes, but you verify Google ID tokens yourself |
| **Email magic link / OTP** | Both | Both | Email link (no OTP code) (not re-checked) | Plugins (not re-checked) | "Passwordless" (methods not listed) | Yes (unverified) | You build it |
| **Extension story** | Docs section on Google via `launchWebAuthFlow`. OTP code works in the popup. | Official Chrome Extension SDK | Official guide; Google needs an offscreen document | None official | Standard OIDC via `launchWebAuthFlow` (not re-checked) | None found | You design it |
| **Expo web + native** | Yes, documented | `@clerk/expo`; native UI components need a dev build; web support not stated | JS SDK (not re-checked) | Yes, both documented | `react-native-auth0` (not re-checked) | RN SDK (unverified) | Plain `fetch` works everywhere |
| **FastAPI verification** | JWKS ES256, PyJWT | JWKS RS256 or `clerk-backend-api` | `firebase-admin` `verify_id_token` (not re-checked) | JWKS EdDSA via JWT plugin | JWKS RS256 (not re-checked) | JWKS / Python SDK (unverified) | Your own key |
| **Extra service to run** | No | No | No | **Yes, a Node server** | No | No | No |
| **Lock-in** | Low | Medium–high | Medium–high | Low | Medium | Medium | None |

### 1b. Per option, briefly

**Supabase Auth (recommended)**
1. **Extension.** Use `supabase-js` in the service worker with `chrome.storage.local` as its storage. That storage option exists in `createClient` (not re-checked).
   - Email: `signInWithOtp`, then `verifyOtp({type:'email'})` with the typed code. Requests are limited to 1 per 60 s, and codes expire after 1 h by default ([docs](https://supabase.com/docs/guides/auth/auth-email-passwordless)).
   - Google: `launchWebAuthFlow` with redirect `https://<ext-id>.chromiumapp.org/` ([chrome.identity](https://developer.chrome.com/docs/extensions/reference/api/identity)), then `signInWithIdToken` ([docs](https://supabase.com/docs/guides/auth/social-login/auth-google)).
   - There is no general "Supabase in extensions" guide beyond that Google section.
2. **Expo.** Native uses `expo-auth-session` and `expo-web-browser` plus deep links ([docs](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)). Web uses the normal `supabase-js` flow.
3. **FastAPI.** Use PyJWT `PyJWKClient` on the JWKS URL. Check `aud`, `iss`, `exp` and the ES256 algorithm.
   - The JWKS is edge-cached for 10 minutes. Don't cache it yourself for more than about 20 minutes ([JWTs](https://supabase.com/docs/guides/auth/jwts)).
   - Access tokens default to 1 h. Refresh tokens are single-use with a 10 s reuse window, and reusing one outside that window revokes the whole session ([sessions](https://supabase.com/docs/guides/auth/sessions)).
4. **Google + email:** both supported.
5. **Limits:** see the TL;DR. Default per-hour email caps when using custom SMTP are configurable but the defaults are unverified.
6. **Privacy.** You pick the region (Mumbai). `supabase-js` adds no analytics (not re-checked; it's open source, so audit it). Your email provider sees users' addresses.
7. **Lock-in: low.** Tokens are standard, user IDs are UUIDs and the auth server is open source. Leaving means copying `auth.users` (email plus Google identity) into your own table. Passwordless users have no password hashes to migrate.
8. **Delete and export.** `auth.admin.deleteUser(id)` with the service-role key, server-side only ([docs](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)). Export is your own `/api/me/export`, because all app data lives in your tables.

**Clerk**
1. **Extension.** Official Chrome Extension SDK with Popup, Side Panel and **Sync Host** modes. Sync Host means that signing in on the dashboard also signs in the extension.
   - **OAuth is not available in Popup or Side Panel modes.** Email links work only with Sync Host.
   - Clerk can't run in content scripts. `createClerkClient()` gives background workers access to tokens.
   - Source: [docs](https://clerk.com/docs/references/chrome-extension/overview).
2. **Expo.** `@clerk/expo`. Native UI components need a dev build, and Expo web support isn't stated ([docs](https://clerk.com/docs/quickstarts/expo)).
3. **FastAPI.** Verify against the JWKS at the Frontend API `/.well-known/jwks.json` and check `azp` ([docs](https://clerk.com/docs/backend-requests/manual-jwt)). Alternatively use `authenticate_request` in [`clerk-backend-api`](https://github.com/clerk/clerk-sdk-python).
   - Session tokens live **60 s** and are refreshed every 50 s by the frontend SDK ([how Clerk works](https://clerk.com/docs/guides/how-clerk-works/overview)). That's awkward for an MV3 service worker that keeps getting suspended.
4. **Google + email:** both.
5. **Limits.** Free plan has a fixed 7-day session lifetime and Clerk branding ([pricing](https://clerk.com/pricing)).
6. **Privacy.** Development instances send SDK telemetry, which can be turned off; Clerk says no end-user data is collected ([telemetry](https://clerk.com/docs/guides/how-clerk-works/security/clerk-telemetry)). Data region not checked (unverified).
7. **Lock-in: medium–high.** Proprietary user IDs and sessions.
8. **Delete:** via the Backend API (not re-checked). **Export:** unverified.

**Firebase Auth**
1. **Extension.** Official guide using the `firebase/auth/web-extension` import (SDK v10.8+). Email link works directly.
   - Google with popup or redirect needs an **offscreen document plus a hosted iframe page**, because MV3 blocks remote code.
   - You must allowlist Google domains in the CSP.
   - Source: [docs](https://firebase.google.com/docs/auth/web/chrome-extension).
2. **Expo:** JS SDK (not re-checked).
3. **FastAPI:** `firebase-admin` (not re-checked).
4. **Google + email link:** both.
5. **Limits:** 50k MAU free ([pricing](https://firebase.google.com/pricing)).
6. **Privacy.** Google-hosted. Analytics only if you add it (not re-checked).
7. **Lock-in: medium–high.**
8. **Delete:** Admin `delete_user` (not re-checked).

**Better Auth**
1. **Extension:** no official guide.
2. **Expo:** native and web supported ([docs](https://www.better-auth.com/docs/integrations/expo)).
3. **FastAPI.** The JWT plugin exposes `/jwks`. Defaults are EdDSA Ed25519 and 15-minute tokens. The docs show only JS verification, but any JWKS library should work (my inference) ([docs](https://www.better-auth.com/docs/plugins/jwt)).
4. **Google + email:** via plugins (not re-checked).
5. **Cost:** library is free.
6. **Privacy.** Fully self-hosted.
7. **Lock-in: low,** but it **requires a TypeScript/Node server**. That's a second backend to host and secure next to FastAPI. Not worth it for a solo maintainer.
8. **Delete:** your own code.

**Auth0.** 25k MAU free and passwordless is included. A custom domain needs card verification, and the first paid tier ($35/mo) covers only 500 MAU, a steep cliff ([pricing](https://auth0.com/pricing)). The extension would use standard OIDC with `launchWebAuthFlow` (not re-checked). Lock-in: medium.

**Stytch.** 10k MAU free. The pricing page doesn't list magic links or OTP, and gives no per-MAU rate ([pricing](https://stytch.com/pricing)). No extension guide found. Not recommended: smallest free tier and pricing is unclear.

**Roll our own (FastAPI)**
- **Endpoints:** `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout`.
- **OTP storage:** store only a hash of each OTP, valid for 10 minutes, with an attempt cap. Rate-limit per email and per IP.
- **Tokens:** ES256 access JWT of about 15 minutes, signed with PyJWT. Refresh tokens are opaque, random, stored hashed and rotated on each use.
- **Google:** verify the Google ID token with `google-auth` (not re-checked).
- **Email providers:**
  - Resend free: 3,000/month, 100/day ([pricing](https://resend.com/pricing)).
  - Brevo free: 300/day ([help](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan), page blocked to my fetcher, confirmed via Brevo's own search snippets).
  - AWS SES: $0.10 per 1,000, and no permanent free email quota is listed, only $200 of new-account credits ([pricing](https://aws.amazon.com/ses/pricing/)).
- **Lock-in:** none. Best for privacy.
- **Risk:** every security bug is yours. Expect roughly 300–500 lines of code plus tests (estimate).

## 2. Hosting comparison

| | Free tier | Sleep / cold start | Nearest region to Nepal | WebSockets | Postgres | Cost ~always-on |
|---|---|---|---|---|---|---|
| **Cloud Run** | 2M req, 180k vCPU-s, 360k GiB-s/month ([pricing](https://cloud.google.com/run/pricing)) | Scales to zero; frequent pings keep it warm. Cold start: a few seconds (unverified) | Mumbai `asia-south1` (not re-checked) | Yes, max 60 min; open socket = billed instance ([docs](https://docs.cloud.google.com/run/docs/triggering/websockets)) | BYO (Supabase/Neon) | $0 → pay per use |
| **Supabase Postgres** | 500 MB DB, 5 GB egress, 2 projects, pauses after 1 week idle, no backups ([pricing](https://supabase.com/pricing)) | Pause only when idle | Mumbai ([regions](https://supabase.com/docs/guides/platform/regions)) | Realtime 200 concurrent | — | Pro $25 |
| **Neon** | 1 GB/project, 100 CU-h/project, suspends after 5 min ([pricing](https://neon.com/pricing)) | Wakes on each connection; latency (unverified) | Regions not on pricing page (unverified) | — | — | Usage-based: $0.106/CU-h |
| **Railway** | $1/month credit (Free); $5 one-off trial ([pricing](https://railway.com/pricing)) | Always on unless Serverless is enabled ([docs](https://docs.railway.com/reference/app-sleeping)) | Singapore ([regions](https://docs.railway.com/reference/deployment-regions)) | Yes (not re-checked) | Template on a volume, $0.15/GB-month ([plans](https://docs.railway.com/reference/pricing/plans)) | Hobby $5 incl. $5 usage |
| **Render** | 750 h/month, **sleeps after 15 min, ~1 min spin-up**, free Postgres **expires after 30 days** ([docs](https://render.com/docs/free)) | Bad for the extension | Singapore ([regions](https://render.com/docs/regions)) | Yes | 1 GB, expires | Paid starter (unverified price) |
| **Fly.io** | **No free tier** for new orgs, only a 2 h / 7 day trial ([pricing](https://docs.fly.io/about/pricing)) | Optional auto-stop | Singapore; **no Mumbai** ([regions](https://docs.fly.io/reference/regions)) | Yes | Managed PG from $38/mo | 256 MB ~$2.19/mo (US; Singapore costs more) |
| **Koyeb** | 1 free instance: 0.1 vCPU, 512 MB; **Frankfurt or Washington only**; sleeps after 1 h idle ([docs](https://www.koyeb.com/docs/reference/instances)) | 1 h idle → zero | Far from Nepal | (not re-checked) | Free PG "5h" (period unclear) ([pricing](https://www.koyeb.com/pricing)) | — |
| **Oracle Always Free** | 2 OCPU / 12 GB Arm VM, forever ([docs](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)) | Always on, **but idle VMs can be reclaimed** (95th-percentile CPU, network and memory under 20% over 7 days) | Home region only; Mumbai/Hyderabad exist (not re-checked) | Yes (your VM) | Self-managed | $0, but you run the OS, TLS, backups and patching |
| **Hetzner** | None | Always on | Singapore exists, but its traffic allowance is 0.5 TB vs 20 TB in the EU ([page](https://www.hetzner.com/cloud/regular-performance/)) | Yes | Self-managed | CX23 €5.49/month in DE/FI after the 15 Jun 2026 price rise ([price change](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)) |

Latency from Kathmandu to Mumbai should be lower than to Singapore, which in turn beats Frankfurt or US East. I did not measure this (unverified). Ping the region test endpoints from Nepal before committing.

Why not the others:
- **Render free:** the 15-minute sleep and ~1-minute wake would turn every first extension call into a timeout, and the free database is deleted after 30+14 days.
- **Koyeb free:** only Frankfurt or Washington.
- **Fly:** no longer free, and has no Mumbai region.
- **Oracle:** free, but a VM is a second job (OS, TLS, backups, patching), and the reclamation rules plus capacity limits are risky for a solo student.

## 3. Token flow for our 3 clients (Supabase Auth + Cloud Run)

1. **Web dashboard login.**
   - Expo web uses `supabase-js` to call `signInWithOtp({email})`. The user types the 6-digit code, and the dashboard calls `verifyOtp`.
   - Google uses `signInWithOAuth({provider:'google'})` with PKCE.
   - `supabase-js` keeps the session and refreshes it on its own.
   - Expo native (v1.1) does the same with deep-link redirects.
2. **Extension gets its own session.** Don't hand over the dashboard's tokens.
   - Supabase refresh tokens are single-use, and reusing one outside the 10 s window **revokes the whole session** ([sessions](https://supabase.com/docs/guides/auth/sessions)). Two clients sharing one refresh-token chain would keep logging each other out.
   - The extension popup offers "Email me a code", which uses `signInWithOtp` then `verifyOtp` with no redirect, or "Continue with Google", which uses `launchWebAuthFlow` then `signInWithIdToken`.
   - The session lives in `chrome.storage.local` through the `supabase-js` storage adapter.
   - Optional polish: the dashboard can check that the extension is installed via `externally_connectable` and `chrome.runtime.sendMessage` ([manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable)). It should send only a "please connect" nudge, never tokens.
   - Add the production dashboard origin to `externally_connectable.matches`. Add the `identity` permission only if you use Google.
3. **FastAPI verifies.**
   - Every client sends `Authorization: Bearer <access_token>`.
   - A `get_current_user` dependency verifies the token with PyJWT's `PyJWKClient(JWKS_URL)` and allows only `algorithms=["ES256"]`.
   - It checks `aud="authenticated"` (not re-checked), `iss=https://<ref>.supabase.co/auth/v1` and `exp`, then returns `sub` as `user_id` (UUID).
   - Every router filters by `user_id`. Tighten the CORS `chrome-extension://.*` regex to your real extension ID.
4. **Refresh.** Access tokens last 1 h by default.
   - The MV3 service worker sleeps, so call `supabase.auth.getSession()` before each API call. It refreshes the token if it has expired.
   - If FastAPI returns 401, call `refreshSession()` once and retry. If that also fails, show "Sign in again" in the popup.
5. **Logout.** `signOut()` on that client clears its storage and deletes the session row in Supabase.
   - An already-issued access token stays valid until `exp` (up to 1 h).
   - For sensitive routes, FastAPI can check that the JWT's `session_id` still exists in `auth.sessions` ([sessions](https://supabase.com/docs/guides/auth/sessions)). That is a cheap query because it's the same Postgres.
6. **Export and delete account.**
   - `GET /api/me/export` returns JSON of all of the user's rows.
   - `DELETE /api/me` deletes the user's rows (use `ON DELETE CASCADE` from a `users` table), then calls the Admin API to delete the user with the **service-role key, kept only in Cloud Run secrets** ([docs](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)).
   - On their next call, the other clients get a 401 and wipe their local storage.

## Open items to check before building

- Whether Google Cloud billing and Railway accept your card from Nepal. Set a budget alert at $5 on day one.
- Cloud Run price tier and real cold-start time in `asia-south1`.
- The default per-hour email limit in Supabase Auth with custom SMTP, and whether Resend's open and click tracking is off by default. It must be off for the privacy promise.
- Whether `launchWebAuthFlow` reuses the browser's Google login cookie (single click) in Chrome, Edge and Brave.
