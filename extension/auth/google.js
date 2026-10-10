// @ts-check
// Google sign-in runs in a tab, not the popup: the popup closes as soon as the Google window takes focus.
import { signInWithGoogle, syncProfileTz, AuthError } from './session.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));

async function run() {
  $('retry').hidden = true;
  $('msg').textContent = 'Opening Google\u2026';
  try {
    const user = await signInWithGoogle();
    await syncProfileTz().catch(() => {});
    await chrome.runtime.sendMessage({ type: 'settings_changed' }).catch(() => {});
    $('msg').textContent = `Signed in${user.email ? ` as ${user.email}` : ''}. Click the FocusGuard AI icon to continue.`;
    $('done').hidden = false;
  } catch (e) {
    $('msg').textContent = e instanceof AuthError ? e.message : 'Couldn\u2019t reach Google or FocusGuard AI. Check your connection.';
    $('retry').hidden = false;
  }
  $('heading').focus();
}

$('retry').addEventListener('click', run);
$('done').addEventListener('click', async () => { const t = await chrome.tabs.getCurrent(); if (t?.id) chrome.tabs.remove(t.id); });
run();
