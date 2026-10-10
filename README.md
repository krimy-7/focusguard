# FocusGuard

Privacy-first focus companion by **Team MindMess**. v1 is a Chrome MV3 extension + a small web
dashboard (Expo SDK 57 web build) backed by a FastAPI/Postgres service. The mobile companion is v1.1.

**Video Link** : [https://drive.google.com/drive/folders/1VXo8Ef5RP5yP-meIAylOmpQDT4So32Gd](https://drive.google.com/drive/folders/1VXo8Ef5RP5yP-meIAylOmpQDT4So32Gd)
---
**PPT Link** : [https://docs.google.com/presentation/d/1e4w2Zpk2WKPfBDMRw7UYcJ0bxZNbkudF/edit?usp=sharing&ouid=109556622737543211140&rtpof=true&sd=true](https://docs.google.com/presentation/d/1e4w2Zpk2WKPfBDMRw7UYcJ0bxZNbkudF/edit?usp=sharing&ouid=109556622737543211140&rtpof=true&sd=true)

**The loop:** plan the day → automatic context detection/confirmation/grouping → a watchdog
that gives you **grace**, then **gentle interventions** → breaks that preserve your progress → recovery.

## Docs

| Doc | What it is |
| --- | --- |
| [docs/SPEC.md](docs/SPEC.md) | Product + engineering spec (intent) |
| [docs/STATUS_AUDIT.md](docs/STATUS_AUDIT.md) | What actually exists, gaps, phase plan (source of truth for status) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log (date · decision · rationale · alternatives) |
| [docs/research/](docs/research/) | Evidence briefs (resumption, nudges, ADHD, competitors, store policy) |

## Stack

| Layer      | Tech                                                                  |
| ---------- | --------------------------------------------------------------------- |
| Dashboard  | Expo SDK 57, expo-router, React 19, TypeScript, NativeWind v4 (web build in v1; mobile in v1.1) |
| Extension  | Chrome Manifest V3 (service worker + content script + popup)           |
| Backend    | FastAPI, SQLAlchemy, Postgres (falls back to SQLite)                   |
| AI         | `mock` by default; DeepSeek / OpenAI / Claude / Gemini / Ollama via env |
| Tunnel     | ngrok (scripts included, demo only)                                    |

## Structure

```
Team-MindMess/
├─ src/                    # Expo app (expo-router): app/, components/, lib/api.ts, theme/
├─ backend/                # FastAPI app (app/: routers, models, services, config), requirements.txt, .env.example
├─ extension/              # MV3: background.js (watchdog), content.js, popup/, blocked.html (Beast Mode),
│                          #      config.js (BASE_URL / DASHBOARD_URL / GRACE_MINUTES), config.local.js (gitignored overrides)
├─ docs/                   # SPEC, STATUS_AUDIT, DECISIONS, research/
└─ scripts/                # dev.ps1 (one-command dev), ngrok-backend.ps1 / .sh
```

## Run it

### Quickstart (Windows)

```powershell
.\scripts\dev.ps1
```

Ensures PostgreSQL is running, starts the ngrok tunnel, writes the tunnel URL into `.env` and
`backend/.env` (CORS), then opens the backend and Expo dev server in their own terminals.

### 1. Dashboard (Expo)

```bash
npm install
npx expo start                   # dev server (w = web)
npx expo export --platform web   # static build check
npx tsc --noEmit                 # typecheck
```

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`. If the backend is unreachable the app
shows honest offline/empty states. Bundled demo data only with `EXPO_PUBLIC_DEMO_MODE=1`.

### 2. Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate        # Windows   (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
cp .env.example .env

# Postgres: create DB `focusguard`, then set
#   DATABASE_URL=postgresql://postgres:<your-password>@localhost:5432/focusguard
# No Postgres? Leave DATABASE_URL empty -> local SQLite.

uvicorn app.main:app --reload --port 8000
```

- API: `http://localhost:8000/api/health`, plus `/api/planning`, `/api/goals`, `/api/contexts`,
  `/api/interventions`, `/api/break`, `/api/mood`, `/api/beast`, `/api/achievements`, `/api/sync`, and legacy routes.
- `.env` flags (all default off):
  - `DEMO_MODE=true` seeds mock data (goals, active context, moods, achievements) on first run. Off = empty DB.
  - `ENABLE_DEV_ROUTES=true` enables `POST /api/dev/reset` (wipes every table). Never on a tunnelled/public backend.
  - `DEBUG=true` for local debugging only.
- `AI_PROVIDER` defaults to `mock` (no keys needed). Set it to deepseek / openai / claude / gemini / ollama
  plus the matching key to use a real provider; missing keys or errors fall back to mock.

### 3. Chrome extension

1. Open `chrome://extensions`, enable **Developer mode**
2. **Load unpacked** → select the `extension/` folder
3. Pin FocusGuard and open the popup.

The watchdog pulls the active context from the backend and:
- starts a quiet **grace period** (default **5 min**, `GRACE_MINUTES`) when you drift;
- then shows a gentle **level 1** nudge, and a playful **level 2** nudge if ignored;
- **blocks** sites listed in an active Beast Mode session (redirects to `blocked.html`).

Backend URL and grace live in `extension/config.js`. For local overrides (e.g. a short grace for a
demo, or an ngrok `BASE_URL`), create `extension/config.local.js` (gitignored):

```js
const FOCUSGUARD_LOCAL_CONFIG = { GRACE_MINUTES: 10 / 60, SECOND_MINUTES: 10 / 60 };
```

### 4. ngrok (demo only)

A phone or remote browser can't reach `localhost:8000`, so expose it:

```powershell
ngrok http 8000
```

Put the HTTPS URL in `.env` → `EXPO_PUBLIC_API_URL=https://<sub>.ngrok-free.dev` (restart
`npx expo start`), and append it to `CORS_ORIGINS` in `backend/.env`. The API client sends
`ngrok-skip-browser-warning: true`. If ngrok restarts, the URL changes; update both spots.
Keep `ENABLE_DEV_ROUTES` off while tunnelled.
