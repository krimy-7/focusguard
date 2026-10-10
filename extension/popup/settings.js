// @ts-check
// Settings view: grace + quiet hours (server, via PATCH /me), AI option, related-site rules,
// extra sensitive sites (device only), sign out.
import { apiFetch, signOut } from '../auth/session.js';
import { endpointFor } from '../ai/providers.js';
import { normalizeSites } from '../beast/beast.js';
import { GRACE_OPTIONS_S, validQuietHours, aiDisclosure, hostPattern, stored } from './model.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));
/** @param {string} msg */
const say = (msg) => { $('status').textContent = msg; };
const changed = () => chrome.runtime.sendMessage({ type: 'settings_changed' }).catch(() => {});
const quietInputs = () => /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('#nudgeForm input[type="time"]'));
let wired = false;
let savedKey = ''; // the stored API key is never put back into the DOM
/** @type {import('../ai/providers.js').AiOption} */
let savedAi = { mode: 'off' }; // restored if Chrome's permission prompt is refused
let nudgesKnown = false; // false = the form shows defaults, not the user's settings: never PATCH them

/** @param {() => void} onClose */
export async function openSettings(onClose) {
  for (const v of ['consentView', 'signedOutView', 'mainView']) $(v).hidden = true;
  $('settingsView').hidden = false;
  $('openSettings').hidden = true;
  $('settingsView').querySelector('h2').focus();
  if (!wired) { wire(onClose); wired = true; }
  await Promise.all([loadNudges(), loadAi(), loadRules(), loadSensitive(), loadAccount()]);
}

async function loadNudges() {
  /** @type {{grace_s?:number, quiet_hours?:{from:string,to:string}[]}} */
  let s = {};
  try {
    const res = await apiFetch('/me');
    if (!res.ok) throw new Error(String(res.status));
    s = (await res.json()).settings || {};
    nudgesKnown = true;
  } catch {
    // D caches GET /me as {at, profile: Profile} (C1), so the settings are one level down.
    const cached = (await stored('fg_settings_cache'))?.profile?.settings;
    s = cached ?? {};
    nudgesKnown = !!cached;
    say(cached ? 'Showing your last saved settings. FocusGuard AI is offline right now.'
      : 'Couldn’t load your settings. FocusGuard AI is offline right now.');
  }
  const grace = s.grace_s ?? 300;
  const opts = GRACE_OPTIONS_S.includes(grace) ? GRACE_OPTIONS_S : [...GRACE_OPTIONS_S, grace].sort((a, b) => a - b);
  $('grace').replaceChildren(...opts.map((x) => new Option(`${Math.round(x / 6) / 10} minutes`, String(x))));
  $('grace').value = String(grace);
  for (const inp of quietInputs()) inp.value = s.quiet_hours?.[Number(inp.dataset.q)]?.[/** @type {'from'|'to'} */ (inp.dataset.k)] ?? '';
}

/** @returns {import('../ai/providers.js').AiOption} */
function readAi() {
  const mode = /** @type {any} */ (document.querySelector('input[name="aiMode"]:checked'))?.value ?? 'off';
  if (mode === 'local') return { mode, baseUrl: $('localUrl').value.trim(), model: $('localModel').value.trim() };
  if (mode === 'key') {
    const provider = $('provider').value;
    return { mode, provider, model: $('keyModel').value.trim(), apiKey: $('apiKey').value.trim() || savedKey,
      ...(provider === 'openai' ? { baseUrl: $('baseUrl').value.trim() || 'https://api.openai.com' } : {}) };
  }
  return { mode };
}

function updateAiUi() {
  const opt = readAi();
  $('aiNano').hidden = opt.mode !== 'nano';
  $('aiLocal').hidden = opt.mode !== 'local';
  $('aiKey').hidden = opt.mode !== 'key';
  $('baseUrlRow').hidden = $('provider').value !== 'openai';
  $('aiDisclosure').textContent = aiDisclosure(opt);
  if (opt.mode === 'nano') checkNano();
}

async function loadAi() {
  const opt = (await stored('fg_ai')) || { mode: 'off' };
  savedAi = opt;
  const radio = document.querySelector(`input[name="aiMode"][value="${opt.mode}"]`);
  if (radio) /** @type {HTMLInputElement} */ (radio).checked = true;
  if (opt.mode === 'local') { $('localUrl').value = opt.baseUrl || ''; $('localModel').value = opt.model || ''; }
  if (opt.mode === 'key') {
    $('provider').value = opt.provider || 'openai';
    $('baseUrl').value = opt.baseUrl || '';
    $('keyModel').value = opt.model || '';
    savedKey = opt.apiKey || '';
    $('apiKey').value = '';
    $('apiKey').placeholder = savedKey ? 'Saved. Leave blank to keep it.' : '';
  }
  updateAiUi();
}

/** @param {string} text */
const nanoSay = (text) => { $('nanoStatus').textContent = text; };

async function checkNano() {
  const LM = /** @type {any} */ (globalThis).LanguageModel;
  $('nanoDownload').hidden = true;
  if (!LM) return nanoSay('This version of Chrome can’t run the built-in model. Pick another option.');
  const a = await LM.availability().catch(() => 'unavailable');
  if (a === 'available') return nanoSay('Ready on this device.');
  if (a === 'downloading') return nanoSay('Chrome is downloading the model. You can close this.');
  if (a === 'downloadable') { $('nanoDownload').hidden = false; return nanoSay('Needs a one-time download of several GB. Use an unmetered connection.'); }
  nanoSay('This device can’t run it (it needs a strong graphics card, or 16 GB of memory).');
}

function wire(/** @type {() => void} */ onClose) {
  $('closeSettings').addEventListener('click', () => { $('settingsView').hidden = true; onClose(); });

  $('nudgeForm').addEventListener('submit', async (/** @type {Event} */ e) => {
    e.preventDefault();
    // The form holds defaults, not the user's settings: saving would wipe their quiet hours (R4: [] clears).
    if (!nudgesKnown) { await loadNudges(); if (nudgesKnown) say('Loaded your current settings. Check them, then save again.'); return; }
    const rows = [0, 1, 2].map((i) => ({
      from: /** @type {HTMLInputElement} */ (document.querySelector(`#nudgeForm input[data-q="${i}"][data-k="from"]`)).value,
      to: /** @type {HTMLInputElement} */ (document.querySelector(`#nudgeForm input[data-q="${i}"][data-k="to"]`)).value }));
    const quiet = validQuietHours(rows);
    const started = rows.filter((r) => r.from || r.to).length;
    try {
      const res = await apiFetch('/me', { method: 'PATCH', body: JSON.stringify({ settings: { grace_s: Number($('grace').value), quiet_hours: quiet } }) });
      if (!res.ok) throw new Error(res.status === 422 ? 'Those settings weren’t accepted.' : `Couldn’t save (error ${res.status}).`);
      await changed();
      say(started > quiet.length ? 'Saved. Incomplete quiet-hour rows were skipped.' : 'Saved.');
    } catch (err) {
      say(err instanceof Error && !/fetch/i.test(err.message) ? err.message : 'Couldn’t reach FocusGuard AI. Try again when you’re online.');
    }
  });

  $('aiForm').addEventListener('change', updateAiUi);
  $('aiForm').addEventListener('input', updateAiUi);

  $('nanoDownload').addEventListener('click', () => {
    const LM = /** @type {any} */ (globalThis).LanguageModel;
    nanoSay('Starting download…');
    // create() must run inside this click (user activation) to start the download.
    LM.create({ monitor(/** @type {any} */ m) { m.addEventListener('downloadprogress', (/** @type {any} */ ev) => nanoSay(`Downloading… ${Math.round(ev.loaded * 100)}%`)); } })
      .then((/** @type {any} */ s) => { s.destroy?.(); nanoSay('Ready on this device.'); $('nanoDownload').hidden = true; })
      .catch(() => nanoSay('The download didn’t start. Check disk space and try again.'));
  });

  $('aiForm').addEventListener('submit', (/** @type {Event} */ e) => {
    e.preventDefault();
    const opt = readAi();
    if (opt.mode === 'local' && (!opt.baseUrl || !opt.model)) return say('Enter the address and model name.');
    if (opt.mode === 'key' && (!opt.model || !opt.apiKey)) return say('Enter the model name and your API key.');
    const url = endpointFor(opt);
    let pattern = null;
    try { pattern = url ? hostPattern(url) : null; } catch { return say('That address doesn’t look right.'); }
    // permissions.request needs the click's user gesture: call it before any await. Chrome's prompt can
    // close the popup, so save now (calls without access just return null) and undo on an explicit "no".
    const ask = pattern ? chrome.permissions.request({ origins: [pattern] }) : Promise.resolve(true);
    chrome.storage.local.set({ fg_ai: opt }).then(async () => {
      if (!(await ask)) {
        await chrome.storage.local.set({ fg_ai: savedAi });
        return say('FocusGuard AI needs permission to reach that address.');
      }
      savedAi = opt;
      if (opt.mode === 'key') { savedKey = opt.apiKey || ''; $('apiKey').value = ''; $('apiKey').placeholder = 'Saved. Leave blank to keep it.'; }
      await changed();
      say('AI choice saved.');
    }).catch((/** @type {Error} */ err) => say(err.message));
  });

  $('sensForm').addEventListener('submit', async (/** @type {Event} */ e) => {
    e.preventDefault();
    const add = normalizeSites($('sensInput').value);
    if (!add.length) return say('Enter a site like example.com.');
    const cur = (await stored('fg_extra_sensitive')) || [];
    await chrome.storage.local.set({ fg_extra_sensitive: [...new Set([...cur, ...add])] });
    $('sensInput').value = '';
    await changed();
    await loadSensitive();
    say(`FocusGuard AI will skip ${add.join(', ')}.`);
  });

  $('signOutBtn').addEventListener('click', async () => {
    await signOut();
    await changed();
    location.reload();
  });
}

/** One row with a Delete button. @param {string} text @param {string} label @param {() => Promise<void>} onDelete */
function row(text, label, onDelete) {
  const li = document.createElement('li');
  const span = document.createElement('span');
  span.textContent = text;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn ghost small';
  btn.textContent = 'Delete';
  btn.setAttribute('aria-label', label);
  btn.addEventListener('click', onDelete);
  li.append(span, btn);
  return li;
}

async function loadRules() {
  /** @type {{host:string, contextId:string, contextTitle:string, at:number}[]} R26 */
  const rules = (await stored('fg_rules')) || [];
  $('rulesEmpty').hidden = rules.length > 0;
  $('rulesList').replaceChildren(...rules.map((r) => row(`${r.host} — part of “${r.contextTitle}”`, `Delete rule for ${r.host}`, async () => {
    const cur = (await stored('fg_rules')) || [];
    // Key on contextId: seed-label titles like "Programming" repeat across contexts.
    await chrome.storage.local.set({ fg_rules: cur.filter((/** @type {any} */ x) => !(x.host === r.host && x.contextId === r.contextId)) });
    await changed(); // R14: D unrelates the host from the live context
    await loadRules();
    say(`Removed the rule for ${r.host}.`);
  })));
}

async function loadSensitive() {
  /** @type {string[]} */
  const list = (await stored('fg_extra_sensitive')) || [];
  $('sensList').replaceChildren(...list.map((h) => row(h, `Stop skipping ${h}`, async () => {
    const cur = (await stored('fg_extra_sensitive')) || [];
    await chrome.storage.local.set({ fg_extra_sensitive: cur.filter((/** @type {string} */ x) => x !== h) });
    await changed();
    await loadSensitive();
  })));
}

async function loadAccount() {
  const auth = (await stored('fg_auth'));
  $('accountText').textContent = auth?.user?.email ? `Signed in as ${auth.user.email}.` : 'Signed in.';
}
