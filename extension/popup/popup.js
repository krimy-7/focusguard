// @ts-check
// Popup: sign-in, current context, pause/break/new context, welcome back, Beast Mode. Talks to the
// service worker only through C3 messages; reads storage.local directly for device-only data.
import { getConfig } from '../config.js';
import { sendCode, verifyCode, isSignedIn, syncProfileTz, apiFetch, AuthError, isDefaultTz } from '../auth/session.js';
import { nameContext } from '../ai/index.js';
import { start as beastStart, stop as beastStop, getBeast, normalizeSites, originsFor } from '../beast/beast.js';
import { pauseUntil, PAUSE_OFF, fmtMinutes, phaseLabel, recentSites, stored } from './model.js';
import { openSettings } from './settings.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));
/** @param {string} msg */
const say = (msg) => { $('status').textContent = msg; };
/** @param {object} msg */
const send = (msg) => chrome.runtime.sendMessage(msg);
/** @param {number} ms */
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const VIEWS = ['consentView', 'signedOutView', 'mainView', 'settingsView'];
const DRIFT = ['grace', 'intervened_l1', 'escalated_l2'];
const PENDING_EMAIL = 'fg_signin_email'; // storage.session: survives the popup closing while the user reads their email
// R27: the AI name for the proposal on screen (`host|title`), kept so the 15 s refresh re-applies it.
let named = { key: '', title: '', mode: '' };
let proposalDirty = false; // the user edited the proposal: never overwrite it
let tzTried = false; // retryTz runs at most once per popup open

/** Spec §3.1: the first-sign-in tz PATCH (code form / google.js) is best effort and can hit a 429/503 or a
 *  dropped network. While D's cached profile still has the server default and this browser is elsewhere,
 *  try again (syncProfileTz re-checks GET /me, so it never overwrites a non-default tz).
 *  ponytail: a user abroad who deliberately picks Asia/Kathmandu gets it replaced; add a "tz synced" key if that matters. */
async function retryTz() {
  if (tzTried) return;
  tzTried = true;
  const fg_settings_cache = await stored('fg_settings_cache');
  if (!isDefaultTz(fg_settings_cache?.profile?.tz)) return; // no cache yet, or already synced
  if (isDefaultTz(Intl.DateTimeFormat().resolvedOptions().timeZone)) return;
  await syncProfileTz();
  await send({ type: 'settings_changed' }).catch(() => {}); // D refreshes fg_settings_cache with the new tz
}

/** @param {string} id @param {boolean} [focus] */
function show(id, focus = false) {
  for (const v of VIEWS) $(v).hidden = v !== id;
  $('openSettings').hidden = id !== 'mainView';
  if (focus) $(id).querySelector('h2')?.focus();
}

/** Send an engine command and re-render from the returned view. @param {string} c @param {object} [args] */
async function cmd(c, args = {}) {
  try {
    const r = await send({ type: 'cmd', cmd: c, ...args });
    if (r?.view) await render(r.view);
  } catch {
    say('FocusGuard AI is starting up. Try again in a moment.');
  }
}

async function refresh() {
  const fg_consent = await stored('fg_consent');
  if (!fg_consent) return show('consentView');
  /** @type {any} */
  let res = null;
  try { res = await send({ type: 'get_view' }); } catch { /* worker asleep or restarting */ }
  const signedIn = res ? res.signedIn : await isSignedIn();
  if (!signedIn) return showSignIn();
  retryTz().catch(() => {}); // fire-and-forget: never delays the view
  if (!$('settingsView').hidden) return; // never yank the user out of Settings
  show('mainView');
  if (res?.view) await render(res.view);
  await renderBeast();
}

/** @param {any} v PopupView (C2) */
async function render(v) {
  const now = Date.now();
  const paused = !!(v.pausedUntil && v.pausedUntil > now);
  const ctx = v.context;
  const onBreak = v.phase === 'on_break';

  $('phasePill').textContent = phaseLabel(v.phase, v.pausedUntil, now);
  $('phasePill').className = `pill${DRIFT.includes(v.phase) && !paused ? ' drift' : paused || onBreak ? ' calm' : ''}`;

  $('ctxBlock').hidden = !ctx || onBreak;
  if (ctx && !onBreak) {
    $('ctxTitle').textContent = ctx.title;
    const bits = [ctx.mode[0].toUpperCase() + ctx.mode.slice(1), `${fmtMinutes(ctx.inContextMin)} in context`];
    if (ctx.confidence === 'inferred') bits.push('guessed');
    if (v.drift && !paused) bits.push(`grace until ${clock(v.drift.deadline)}`);
    $('ctxMeta').textContent = bits.join(' · ');
  }
  $('backBtn').hidden = !(ctx && ['intervened_l1', 'escalated_l2'].includes(v.phase));
  if (ctx) $('backBtn').textContent = `Back to ${ctx.title}`;

  const proposing = !ctx && v.phase === 'detected' && v.proposal;
  $('proposalForm').hidden = !proposing;
  if (proposing) {
    const key = `${v.proposal.host}|${v.proposal.title}`;
    if (key !== named.key) { named = { key, title: '', mode: '' }; proposalDirty = false; suggestName(v.proposal, key); }
    fillProposal(named.title || v.proposal.suggested.title, named.mode || v.proposal.suggested.mode);
  }
  $('idleHint').hidden = !!ctx || !!proposing;

  $('welcomeBlock').hidden = !(onBreak && ctx);
  if (onBreak && ctx) {
    const key = `fg_resume:${ctx.id}`;
    const resume = await stored(key);
    const sites = recentSites(resume);
    $('welcomeNote').textContent = v.onBreak?.note ? `“${v.onBreak.note}”` : '';
    $('welcomeNote').hidden = !v.onBreak?.note;
    $('welcomeCtx').textContent = ctx.title;
    $('welcomeSites').textContent = [`On a break since ${clock(v.onBreak?.startedAt ?? now)}`, sites.length ? `You were on ${sites.join(', ')}` : '']
      .filter(Boolean).join('. ');
    $('resumeBtn').textContent = `Resume ${ctx.title}`;
  }

  $('pausedBlock').hidden = !paused;
  if (paused) $('pausedText').textContent = v.pausedUntil >= PAUSE_OFF ? 'Nudges are off until you turn them back on.' : `Nudges are paused until ${clock(v.pausedUntil)}.`;

  $('ctxActions').hidden = !ctx;
  $('newCtxBtn').hidden = onBreak;
  $('pauseMenu').hidden = paused;
  $('breakMenu').hidden = onBreak || !['active', ...DRIFT].includes(v.phase);
}

/** Pre-fill the proposal form unless the user is editing it. @param {string} title @param {string} mode */
function fillProposal(title, mode) {
  if (proposalDirty || document.activeElement === $('proposalTitle')) return;
  $('proposalTitle').value = title;
  $('proposalMode').value = mode;
}

/** R27: ask the optional AI for a context name, once per proposal. Fire-and-forget: nameContext
 *  resolves to null (never throws) when AI fails, and may take up to 6 s.
 *  @param {{host:string, title:string}} p @param {string} key */
async function suggestName(p, key) {
  const fg_ai = await stored('fg_ai');
  if ((fg_ai?.mode ?? 'off') === 'off') return; // no AI: don't even fetch goals
  /** @type {string[]} */
  let goals = [];
  try {
    const r = await apiFetch('/goals'); // C1: no `day` = today in the profile tz
    if (r.ok) goals = (await r.json()).map((/** @type {any} */ g) => g.title);
  } catch { /* signed out or offline: name it without goals */ }
  const n = await nameContext({ host: p.host, title: p.title, goals });
  if (!n || named.key !== key) return; // AI off or no answer, or the proposal changed meanwhile
  named = { key, title: n.title, mode: n.mode };
  if (!$('proposalForm').hidden) fillProposal(n.title, n.mode);
}

async function renderBeast() {
  const st = await getBeast();
  $('beastOn').hidden = !st;
  $('beastForm').hidden = !!st;
  if (st) $('beastText').textContent = `Blocking ${st.sites.join(', ')} until ${clock(st.until)}.`;
}

async function showSignIn() {
  show('signedOutView');
  const pending = await stored(PENDING_EMAIL, chrome.storage.session);
  $('emailForm').hidden = !!pending;
  $('codeForm').hidden = !pending;
  // One primary action per step: while a code is being entered, "Sign in" is it (Google returns with "Use a different email").
  $('googleBtn').hidden = !!pending;
  $('divider').hidden = !!pending;
  if (pending) $('codeHint').textContent = `We sent a 6-digit code to ${pending}. It can take a minute to arrive.`;
}

/** @param {unknown} e */
const authMessage = (e) => (e instanceof AuthError ? e.message : 'Couldn’t reach the sign-in service. Check your connection and try again.');

/** @param {HTMLFormElement} form @param {() => Promise<void>} work */
async function busy(form, work) {
  const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type="submit"]'));
  btn.disabled = true;
  $('signInError').textContent = '';
  try { await work(); } catch (e) { $('signInError').textContent = authMessage(e); } finally { btn.disabled = false; }
}

$('emailForm').addEventListener('submit', (/** @type {Event} */ e) => {
  e.preventDefault();
  const email = $('email').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) { $('signInError').textContent = 'Enter your email address.'; return; }
  busy($('emailForm'), async () => {
    await sendCode(email);
    await chrome.storage.session.set({ [PENDING_EMAIL]: email });
    await showSignIn();
    $('code').focus();
  });
});

$('codeForm').addEventListener('submit', (/** @type {Event} */ e) => {
  e.preventDefault();
  const code = $('code').value.trim();
  if (!/^\d{6}$/.test(code)) { $('signInError').textContent = 'Enter the 6-digit code from the email.'; return; }
  busy($('codeForm'), async () => {
    const email = await stored(PENDING_EMAIL, chrome.storage.session);
    await verifyCode(email, code);
    await chrome.storage.session.remove(PENDING_EMAIL);
    await syncProfileTz().catch(() => {});
    await send({ type: 'settings_changed' }).catch(() => {});
    say('Signed in.');
    await refresh();
    show('mainView', true);
  });
});

$('differentEmail').addEventListener('click', async () => {
  await chrome.storage.session.remove(PENDING_EMAIL);
  await showSignIn();
  $('email').focus();
});

// The popup closes when the Google window takes focus, so the flow runs in its own tab.
$('googleBtn').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('auth/google.html') });
  window.close();
});

$('openOnboarding').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  window.close();
});

$('proposalForm').addEventListener('submit', (/** @type {Event} */ e) => {
  e.preventDefault();
  const title = $('proposalTitle').value.trim();
  if (!title) { $('proposalTitle').focus(); return; }
  cmd('confirm', { title, mode: $('proposalMode').value });
});
for (const id of ['proposalTitle', 'proposalMode']) $(id).addEventListener('input', () => { proposalDirty = true; });
$('proposalCancel').addEventListener('click', () => cmd('cancel'));
$('backBtn').addEventListener('click', () => cmd('back'));
$('resumeBtn').addEventListener('click', () => cmd('resume'));
$('unpauseBtn').addEventListener('click', () => cmd('resume'));
$('newCtxBtn').addEventListener('click', async () => {
  await cmd('end');
  say('Context ended. Open the tab you’re starting on and FocusGuard AI will offer to track it.');
});

for (const b of document.querySelectorAll('[data-pause]')) {
  b.addEventListener('click', async () => {
    $('pauseMenu').open = false;
    await cmd('pause', { until: pauseUntil(/** @type {any} */ (b).dataset.pause, Date.now()) });
  });
}

$('breakForm').addEventListener('submit', async (/** @type {Event} */ e) => {
  e.preventDefault();
  const note = $('breakNote').value.trim();
  $('breakMenu').open = false;
  $('breakNote').value = '';
  await cmd('break', note ? { note } : {});
});

$('beastForm').addEventListener('submit', (/** @type {Event} */ e) => {
  e.preventDefault();
  const sites = normalizeSites($('beastSites').value);
  const minutes = Number($('beastMinutes').value);
  if (!sites.length) return say('Add at least one site to block, like reddit.com.');
  if (!minutes) return say('Choose how long Beast Mode should run.');
  // permissions.request needs the click's user gesture: call it before any await. Chrome's prompt can close
  // the popup, so start now (the rules stay inert without host access) and roll back on an explicit "no".
  const asked = chrome.permissions.request({ origins: originsFor(sites) });
  (async () => {
    await beastStart(sites, minutes);
    await send({ type: 'settings_changed' }).catch(() => {});
    await renderBeast();
    if (await asked) return say('Beast Mode is on.');
    await beastStop();
    await send({ type: 'settings_changed' }).catch(() => {});
    await renderBeast();
    say('Beast Mode needs access to those sites to block them.');
  })().catch((/** @type {Error} */ err) => say(err.message));
});

$('beastStop').addEventListener('click', async () => {
  await beastStop();
  await send({ type: 'settings_changed' }).catch(() => {});
  await renderBeast();
  say('Beast Mode is off.');
});

$('openSettings').addEventListener('click', () => openSettings(async () => { show('mainView', true); await refresh(); }));

getConfig().then((c) => { $('dashboardLink').href = c.DASHBOARD_URL; }); // R11/R28: includes config.local.json overrides

// Spec §3.1's settings refresh on popup open is D's get_view (refreshSettings, 60 s max age): no extra message.
refresh();
// Keep "time in context" and grace fresh, but never while the user is typing.
setInterval(() => {
  const tag = document.activeElement?.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') refresh();
}, 15_000);
