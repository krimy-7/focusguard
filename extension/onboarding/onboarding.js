// @ts-check
// First-run consent (Chrome Web Store prominent disclosure). Writes fg_consent only on "Start", then goes
// straight to Google sign-in (auth/google.html) so the next step is one click, not a hunt for a toolbar icon.
import { driftDomains } from '../popup/model.js';
import { originsFor } from '../beast/beast.js';
import { isSignedIn } from '../auth/session.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));
export const CONSENT_VERSION = 1;

/** @type {string[]} */
let domains = [];
fetch(chrome.runtime.getURL('engine/domains.json'))
  .then((r) => r.json())
  .then((seed) => { domains = driftDomains(seed); })
  .catch(() => { $('grantBtn').disabled = true; $('grantStatus').textContent = 'Couldn’t load the site list. You can grant access later.'; });

for (const r of document.querySelectorAll('input[name="aiMode"]')) r.addEventListener('change', () => { $('aiVal').textContent = /** @type {HTMLInputElement} */ (r).value === 'nano' ? 'On-device' : 'Off'; });

$('grantBtn').addEventListener('click', () => {
  // permissions.request needs this click's user gesture: no await before it.
  chrome.permissions.request({ origins: originsFor(domains) })
    .then((ok) => { $('grantStatus').textContent = ok ? 'Done. Nudges will appear on those sites.' : 'No problem. FocusGuard AI will use notifications instead.'; })
    .catch(() => { $('grantStatus').textContent = 'Chrome didn’t ask. You can try again later.'; });
});

$('startBtn').addEventListener('click', async () => {
  const mode = /** @type {HTMLInputElement} */ (document.querySelector('input[name="aiMode"]:checked')).value;
  const { fg_ai } = await chrome.storage.local.get('fg_ai');
  await chrome.storage.local.set({ fg_consent: { at: Date.now(), version: CONSENT_VERSION }, fg_ai: { ...(fg_ai || {}), mode } });
  await chrome.runtime.sendMessage({ type: 'settings_changed' }).catch(() => {});
  $('startBtn').hidden = true;
  $('laterBtn').hidden = true;
  if (await isSignedIn().catch(() => false)) { $('status').textContent = 'You’re set. FocusGuard AI is watching quietly. You can close this tab.'; return; }
  $('status').textContent = 'You’re set. Opening Google sign-in…';
  location.assign(chrome.runtime.getURL('auth/google.html'));
});

$('laterBtn').addEventListener('click', async () => {
  const t = await chrome.tabs.getCurrent();
  if (t?.id) chrome.tabs.remove(t.id);
});

$('heading').focus();
