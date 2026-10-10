// @ts-check
// Page shown by Beast Mode's redirect rule: calm copy, "Back to {context}", and
// "Continue anyway" after a 10 s wait (a 10-minute allow rule for this tab only).
import { getBeast, allowOnce, normalizeSites } from './beast.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));
export const WAIT_S = 10;
const site = normalizeSites(new URLSearchParams(location.search).get('site') || '')[0] || '';
const clock = (/** @type {number} */ ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

chrome.runtime.sendMessage({ type: 'get_view' })
  .then((/** @type {any} */ r) => { if (r?.view?.context?.title) $('ctx').textContent = r.view.context.title; })
  .catch(() => {});

async function init() {
  const st = await getBeast();
  if (!st || !st.sites.includes(site)) {
    // Beast Mode ended, or a crafted link (`?site=` not in the Beast list; this page is web-accessible):
    // offer only Back, never a FocusGuard-branded jump to an arbitrary host.
    // The unvalidated `?site=` is never echoed into the page either.
    $('headline').textContent = st ? 'Nothing is blocked here.' : 'Beast Mode has ended.';
    $('why').textContent = st ? 'FocusGuard AI isn’t blocking this site.' : 'Your sites are open again.';
    $('cont').hidden = true;
    $('wait').textContent = '';
    return;
  }
  $('site').textContent = site;
  $('why').textContent = `You asked FocusGuard AI to keep it closed until ${clock(st.until)}. It'll still be here later.`;
  let left = WAIT_S;
  const timer = setInterval(() => {
    left -= 1;
    if (left > 0) { $('wait').textContent = `Continue anyway is available in ${left} seconds.`; return; }
    clearInterval(timer);
    $('cont').disabled = false;
    $('wait').textContent = 'You can continue for 10 minutes in this tab.';
  }, 1000);
}

$('cont').addEventListener('click', async () => {
  const tab = await chrome.tabs.getCurrent();
  // Navigate only to a site allowOnce accepted (it is in the active Beast list): no open redirect.
  const id = tab?.id !== undefined ? await allowOnce(tab.id, site) : null;
  if (id === null) { $('cont').hidden = true; $('wait').textContent = 'Beast Mode has ended. Use Back.'; return; }
  location.replace(`https://${site}/`);
});

$('back').addEventListener('click', async () => {
  if (history.length > 1) { history.back(); return; }
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id !== undefined) chrome.tabs.update(tab.id, { url: 'chrome://newtab/' });
});

init();
