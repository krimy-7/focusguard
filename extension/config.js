// Central config for the FocusGuard extension.
// Override these before loading the extension if your backend is elsewhere
// (e.g. an ngrok URL for the hackathon demo).
const FOCUSGUARD_CONFIG = {
  BASE_URL: "http://localhost:8000",
  WS_URL: "ws://localhost:8000/ws",
  // Where "Go to Dashboard" points (the FocusGuard app).
  DASHBOARD_URL: "http://localhost:8081",
  // OpenRouter for intervention messages. Keys are NOT stored here — put them
  // in extension/config.local.js (gitignored). Leave unset to use the built-in
  // mock messages. Get keys at https://openrouter.ai/keys.
  OPENROUTER_URL: "https://openrouter.ai/api/v1/chat/completions",
  OPENROUTER_KEY_FIRST: "",
  OPENROUTER_KEY_SECOND: "",
  OPENROUTER_MODEL: "openrouter/free",
  // Only report domains/titles above this many seconds to reduce noise.
  MIN_CONTEXT_SECONDS: 60,
  // A tab stay of at least this long counts as a focus session.
  MIN_SESSION_SECONDS: 300,
  // Watchdog grace period before the first intervention (minutes).
  GRACE_MINUTES: 10/60,
  // Delay before the second (playful) intervention if the first is ignored.
  SECOND_MINUTES: 10/60,
};

// Merge local, gitignored overrides (extension/config.local.js). Loaded via
// importScripts in background.js; harmless no-op if the file doesn't exist.
if (typeof FOCUSGUARD_LOCAL_CONFIG === "object" && FOCUSGUARD_LOCAL_CONFIG) {
  Object.assign(FOCUSGUARD_CONFIG, FOCUSGUARD_LOCAL_CONFIG);
}
