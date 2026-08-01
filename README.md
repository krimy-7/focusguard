# FocusGuard

Privacy-first focus coach. An Expo (SDK 57) mobile app + Chrome MV3 extension backed by a
FastAPI/Postgres service with an AI-powered, mock-data-safe layer.

**The loop:** morning planning → automatic context detection/confirmation/grouping → a watchdog
that gives you **grace**, then **gentle interventions** → breaks that preserve your progress →
progress/achievements → support tools (Pomodoro, meditation, mood, Beast Mode) → cross-device sync.

> Design system: Plus Jakarta Sans + Be Vietnam Pro, Material-3 palette, Tailwind via NativeWind v4.

## Stack

| Layer      | Tech                                                                  |
| ---------- | --------------------------------------------------------------------- |
| Mobile     | Expo SDK 57, expo-router, React 19, TypeScript, NativeWind v4 (Tailwind) |
| Extension  | Chrome Manifest V3 (service worker + content script + popup)           |
| Backend    | FastAPI, SQLAlchemy, Postgres (falls back to SQLite), WebSocket        |
| AI         | DeepSeek / OpenAI / Claude / Gemini / Ollama via env — auto mock fallback |
| Tunnel     | ngrok (scripts included)                                               |

## Structure

```
FocusGuard/
├─ src/                    # Expo app (expo-router)
│  ├─ app/                 # (tabs): Today, Contexts, Progress, Support + Settings
│  ├─ components/          # AppText, Card, TopAppBar, ModePill, EmptyState, …
│  ├─ lib/                 # api.ts (API client + mock fallback), mock.ts
│  └─ theme/               # Material-3 palette → Tailwind safelist
├─ backend/
│  ├─ app/                 # FastAPI app (routers, models, services, config)
│  ├─ requirements.txt
│  └─ .env.example
├─ extension/
│  ├─ manifest.json        # MV3
│  ├─ background.js        # watchdog: grace period → level 1/2 interventions + Beast Mode
│  ├─ blocked.html         # Beast Mode block page
│  ├─ content.js
│  ├─ config.js            # BASE_URL / GRACE_MINUTES / SECOND_MINUTES / DASHBOARD_URL
│  ├─ popup/               # 320×520 popup UI (context + Beast Mode status line)
│  └─ icons/
└─ scripts/
   ├─ dev.ps1              # ONE command: Postgres + ngrok + backend + Expo
   ├─ ngrok-backend.ps1 / .sh
   └─ reset-project.js     # expo template helper
```

## Run it

### Quickstart (recommended)

```powershell
.\scripts\dev.ps1
```

This single command: ensures PostgreSQL is running, starts the ngrok tunnel for the
backend, auto-writes the tunnel URL into `.env` and `backend/.env` (CORS), then opens
the backend and Expo dev server in their own terminals. Scan the QR code in the Expo
window to run on your phone — it talks to the backend through ngrok, no `localhost`.

### 1. Mobile app

```bash
npm install
npx expo start        # dev server (a / web / android / ios)
npx expo export --platform web   # static build check
npx tsc --noEmit                 # typecheck
```

### 2. Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate        # Windows   (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt

# Postgres (default): create DB `focusguard`, user `postgres`, password `CHANGE_ME`
#   cp .env.example .env  -> set DATABASE_URL=postgresql://postgres:CHANGE_ME@localhost:5432/focusguard
# No Postgres?  leave DATABASE_URL empty -> uses local SQLite and seeds itself.

uvicorn app.main:app --reload --port 8000
```

- API: `http://localhost:8000/api/health`, plus product routers:
  `/api/planning` (extract goals), `/api/goals`, `/api/contexts` (detect/confirm/group),
  `/api/interventions`, `/api/break`, `/api/mood`, `/api/beast`, `/api/achievements`,
  `/api/sync`, and legacy `/api/stats`, `/api/tasks`, `/api/sessions`, `/api/events`, `/api/insights`
- WebSocket: `ws://localhost:8000/ws`
- On first run the DB auto-seeds realistic mock data (goals, active context, moods, achievements).

### 3. Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. Pin FocusGuard and open the popup.

The watchdog in `extension/background.js` pulls the active context from the backend and:
- starts a quiet **grace period** (default 5 min, `GRACE_MINUTES` in `config.js`) when you drift;
- then sends a gentle **level 1** notification ("Back to work / Extend timer / Dismiss"),
  and a playful **level 2** nudge if ignored;
- **blocks** sites listed in an active Beast Mode session (redirects to `blocked.html`).

Set the backend URL in `extension/config.js` (`BASE_URL`, `DASHBOARD_URL`).

### 4. AI provider (optional)

Set `AI_PROVIDER` and the matching key in `backend/.env` (deepseek / openai / claude / gemini / ollama).
If the provider is missing a key or unreachable, insights automatically fall back to local mock data —
the demo never breaks.

### 5. ngrok for the demo

The mobile app cannot reach `localhost:8000` on your machine, so it needs a public tunnel.

```powershell
ngrok http 8000
```

Copy the HTTPS URL into:
- `.env` → `EXPO_PUBLIC_API_URL=https://<sub>.ngrok-free.dev` (and `EXPO_PUBLIC_WS_URL=wss://<sub>.ngrok-free.dev/ws`),
  then **restart `npx expo start`** so the app picks it up;
- `backend/.env` → append it to `CORS_ORIGINS`.

The API client already sends `ngrok-skip-browser-warning: true`, so requests pass straight through
ngrok's free-tier interstitial. The desktop extension keeps using `localhost` (same backend, so
phone ↔ desktop sync works against the same Postgres).

> `ngrok` must stay running while you demo. If it restarts, the URL changes — update the two spots above.
