// @ts-check
// Options page (chrome-extension://…/popup/options.html). Settings need setup and a sign-in; without them it says so and
// points at the right step. The settings logic itself lives in settings.js.
import { isSignedIn } from '../auth/session.js';
import { stored } from './model.js';
import { openSettings } from './settings.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));

/** @param {string} title @param {string} text @param {string} button @param {string} page */
function gate(title, text, button, page) {
  $('gateTitle').textContent = title;
  $('gateText').textContent = text;
  $('gateBtn').textContent = button;
  $('gateBtn').onclick = async () => { await chrome.tabs.create({ url: chrome.runtime.getURL(page) }); window.close(); };
  $('gateView').hidden = false;
  $('gateTitle').focus();
}

async function init() {
  if (!(await stored('fg_consent'))) return gate('Finish setting up first', 'FocusGuard AI doesn’t look at any tabs until you’ve read what it does and clicked Start.', 'Open setup', 'onboarding/onboarding.html');
  if (!(await isSignedIn())) return gate('Sign in to change settings', 'Your settings are saved to your account, so they follow you.', 'Continue with Google', 'auth/google.html');
  $('settingsView').hidden = false;
  await openSettings();
}

init();
