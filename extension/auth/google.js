// @ts-check
// Google sign-in runs in a tab, not the popup: the popup closes as soon as the Google window takes focus.
import { signInWithGoogle, syncProfileTz, AuthError } from './session.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));
const CLOSE_AFTER_MS = 2500; // long enough to read "Signed in", short enough not to leave a stray tab

async function closeTab() {
  const t = await chrome.tabs.getCurrent();
  if (t?.id) chrome.tabs.remove(t.id);
}

async function run() {
  $('retry').hidden = true;
  $('msg').textContent = 'Opening Google…';
  try {
    const user = await signInWithGoogle();
    await syncProfileTz().catch(() => {});
    await chrome.runtime.sendMessage({ type: 'settings_changed' }).catch(() => {});
    $('win').dataset.state = 'open'; // the lattice leaf slides open: you're in
    $('msg').textContent = `Signed in${user.email ? ` as ${user.email}` : ''}. This tab will close in a moment.`;
    $('done').hidden = false;
    setTimeout(closeTab, CLOSE_AFTER_MS);
  } catch (e) {
    $('msg').textContent = e instanceof AuthError ? e.message : 'Couldn’t reach Google or FocusGuard AI. Check your connection.';
    $('retry').hidden = false;
  }
  $('heading').focus();
}

$('retry').addEventListener('click', run);
$('done').addEventListener('click', closeTab);
run();
