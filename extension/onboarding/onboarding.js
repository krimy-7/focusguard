// @ts-check
// First-run consent (Chrome Web Store prominent disclosure). Writes fg_consent only on "Start".
import { driftDomains } from '../popup/model.js';
import { originsFor } from '../beast/beast.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));
export const CONSENT_VERSION = 1;

/** @type {string[]} */
let domains = [];
fetch(chrome.runtime.getURL('engine/domains.json'))
  .then((r) => r.json())
  .then((seed) => {
    domains = driftDomains(seed);
    $('examples').textContent = domains.slice(0, 4).join(', ') || 'social media and video sites';
    $('grantBtn').textContent = `Allow nudges on ${domains.length} sites`;
  })
  .catch(() => { $('grantBtn').disabled = true; $('grantStatus').textContent = 'Couldn\u2019t load the site list. You can grant access later.'; });

$('grantBtn').addEventListener('click', () => {
  // permissions.request needs this click's user gesture: no await before it.
  chrome.permissions.request({ origins: originsFor(domains) })
    .then((ok) => { $('grantStatus').textContent = ok ? 'Done. Nudges will appear on those sites.' : 'No problem. FocusGuard AI will use notifications instead.'; })
    .catch(() => { $('grantStatus').textContent = 'Chrome didn\u2019t ask. You can try again later.'; });
});

$('startBtn').addEventListener('click', async () => {
  const mode = /** @type {HTMLInputElement} */ (document.querySelector('input[name="aiMode"]:checked')).value;
  const { fg_ai } = await chrome.storage.local.get('fg_ai');
  await chrome.storage.local.set({ fg_consent: { at: Date.now(), version: CONSENT_VERSION }, fg_ai: { ...(fg_ai || {}), mode } });
  await chrome.runtime.sendMessage({ type: 'settings_changed' }).catch(() => {});
  $('startBtn').hidden = true;
  $('laterBtn').hidden = true;
  $('status').textContent = mode === 'nano'
    ? 'You\u2019re set. Click the FocusGuard AI icon in the toolbar to sign in. If the on-device model needs a download, start it from Settings.'
    : 'You\u2019re set. Click the FocusGuard AI icon in the toolbar to sign in.';
});

$('laterBtn').addEventListener('click', async () => {
  const t = await chrome.tabs.getCurrent();
  if (t?.id) chrome.tabs.remove(t.id);
});

$('heading').focus();
