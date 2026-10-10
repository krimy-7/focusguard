// @ts-check
// C4 auth exports for the popup, pages and service worker. Logic and tests live in core.js.
// Static imports only: module service workers forbid import() and top-level await.
import { getConfig } from '../config.js';
import { createAuth } from './core.js';

export { AuthError, AUTH_KEY, DEFAULT_TZ, isDefaultTz } from './core.js';

const auth = createAuth({
  fetch: (input, init) => fetch(input, init),
  storage: {
    get: (k) => chrome.storage.local.get(k),
    set: (o) => chrome.storage.local.set(o),
    remove: (k) => chrome.storage.local.remove(k),
  },
  config: getConfig, // R11/R28: CONFIG holds defaults only; getConfig() merges fg_config_override
  now: () => Date.now(),
  launchWebAuthFlow: (o) => chrome.identity.launchWebAuthFlow(o),
  redirectUrl: () => chrome.identity.getRedirectURL(),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  // R29: tell the shell. Pages only: inside the service worker the shell already knows.
  onSignedOut: () => { if (typeof window !== 'undefined') chrome.runtime.sendMessage({ type: 'settings_changed' }).catch(() => {}); },
});

export const { sendCode, verifyCode, signInWithGoogle, getAccessToken, isSignedIn, signOut, apiFetch, syncProfileTz } = auth;
