// Central config for the FocusGuard extension.
// Override these before loading the extension if your backend is elsewhere
// (e.g. an ngrok URL for the hackathon demo).
const FOCUSGUARD_CONFIG = {
  BASE_URL: "http://localhost:8000",
  WS_URL: "ws://localhost:8000/ws",
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
