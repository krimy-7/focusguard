// Central config for the FocusGuard extension.
// Override these before loading the extension if your backend is elsewhere
// (e.g. an ngrok URL for the hackathon demo).
const FOCUSGUARD_CONFIG = {
  BASE_URL: "http://localhost:8000",
  // Where "Go to Dashboard" points (the FocusGuard app).
  DASHBOARD_URL: "http://localhost:8081",
  // Only report domains/titles above this many seconds to reduce noise.
  MIN_CONTEXT_SECONDS: 60,
  // A tab stay of at least this long counts as a focus session.
  MIN_SESSION_SECONDS: 300,
  // Watchdog grace period before the first intervention (minutes).
  GRACE_MINUTES: 5,
  // Delay before the second (playful) intervention if the first is ignored.
  SECOND_MINUTES: 5,
};

// Merge local, gitignored overrides (extension/config.local.js), e.g.
// `const FOCUSGUARD_LOCAL_CONFIG = { GRACE_MINUTES: 10 / 60 };` for a demo.
// Loaded via importScripts in background.js; harmless no-op if missing.
if (typeof FOCUSGUARD_LOCAL_CONFIG === "object" && FOCUSGUARD_LOCAL_CONFIG) {
  Object.assign(FOCUSGUARD_CONFIG, FOCUSGUARD_LOCAL_CONFIG);
}
