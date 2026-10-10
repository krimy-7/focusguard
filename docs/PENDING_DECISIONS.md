# Pending decisions & actions for Krishna

Decided 2026-10-10 → recorded as D-17…D-21 in `docs/DECISIONS.md`: name **FocusGuard AI**, **GitHub Releases** distribution ($0), **MIT** license (done), privacy policy at dashboard `/privacy`, **Cloudflare Pages** + `*.pages.dev`, Yeti mascot, hackathon repo untouched, Origins credit, **no minimum age**.

## Your actions (only you can do these)

| # | Action | Exact settings |
|---|---|---|
| A1 | **Revoke the 2 OpenRouter keys** (prefixes `sk-or-v1-193e…`, `sk-or-v1-a34b…`) | openrouter.ai → Settings → Keys. If they're not in your account, they're likely in **devsdenepal**'s — ask them. They're still visible in the hackathon repo's `backend/.env.example` (branches main/dev/saroj). |
| A2 | **Supabase** project | Region **South Asia (Mumbai)**. Auth → Providers: **Email** on (OTP), **Google** on. Auth → Email Templates → "Magic Link": body must contain `{{ .Token }}` (so users get a 6-digit code). Auth → URL Configuration → Redirect URLs: add `https://jkkgdjhaoomnjkblodmmjoikglknmifi.chromiumapp.org/**` and (later) your `https://<name>.pages.dev/**`. Send me: **Project URL** + **anon public key**. Keep the **service_role** key private until deploy. |
| A3 | **Gmail SMTP** for email codes (D-22) | Use a dedicated Gmail (e.g. focusguard.ai.app@gmail.com) → turn on 2-Step Verification → myaccount.google.com/apppasswords → create an App Password. Supabase → Auth → SMTP Settings: host `smtp.gmail.com`, port `465`, username = the Gmail address, password = the 16-char App Password, sender name **FocusGuard AI**. Limit ~500 emails/day. |
| A4 | **Google OAuth client** (primary sign-in, D-22) | console.cloud.google.com → APIs & Services → OAuth consent screen: app name **FocusGuard AI**, External, scopes email/profile/openid only. Credentials → OAuth client ID → Web application → Authorized redirect URI = `https://<your-project>.supabase.co/auth/v1/callback`. Paste client ID/secret into Supabase → Google provider. No billing needed. |
| A5 | **Cloudflare** account (free) | Just create it; I'll set up Pages when the dashboard is ready. |
| A6 | Merge the Phase 0 PR on `krimy-7/focusguard` | — |

Fixed extension ID (from the committed public key): **`jkkgdjhaoomnjkblodmmjoikglknmifi`**. The private key lives only at `C:\Users\Krishna\.focusguard\extension-key.pem` — back it up somewhere safe (needed if you ever publish to the store with the same ID); never commit it.

## Still open

| # | Decision | Recommendation |
|---|---|---|
| 10 | Start the build now (5 agents, one per stream, then I verify everything)? | **Yes** — waiting only on the plan-review workflow to finish. |
| 11 | Your **contact email** for the privacy policy (`docs/PRIVACY_POLICY_DRAFT.md`) | A dedicated address (e.g. a new Gmail) rather than your personal one. |
