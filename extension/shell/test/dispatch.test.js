// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDispatch, buildCfg } from "../dispatch.js";
import { fakeChrome } from "./fake-chrome.js";

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
const initialState = (/** @type {number} */ now) => ({ rev: 0, phase: "idle", lastSeenAt: now });
/** Stub engine: bumps rev, remembers the input type. */
const stubStep = (/** @type {any} */ prev, /** @type {any} */ input, /** @type {number} */ now) => ({
  state: { ...prev, rev: prev.rev + 1, lastSeenAt: now, last: input.type },
  effects: [{ type: "log", level: "debug", msg: input.type }],
});

/** @param {{consent?:boolean, step?:Function, runEffects?:Function}} [o] */
function setup({ consent = true, step = stubStep, runEffects = async () => {} } = {}) {
  const chrome = fakeChrome();
  if (consent) chrome.storage.local.data.set("fg_consent", { at: 1, version: 1 });
  let t = 1000;
  const d = createDispatch({
    step: /** @type {any} */ (step), initialState, chrome, getCfg: async () => ({ GRACE_DEFAULT_S: 300 }),
    runEffects: /** @type {any} */ (runEffects), now: () => (t += 1000), log: () => {},
  });
  return { chrome, ...d };
}

test("no consent → nothing is observed or stored", async () => {
  let called = 0;
  const { chrome, dispatch } = setup({ consent: false, step: (/** @type {any} */ ...a) => { called++; return stubStep(a[0], a[1], a[2]); } });
  assert.equal(await dispatch({ type: "landing" }), null);
  assert.equal(called, 0);
  assert.equal(chrome.storage.local.data.has("fg_engine"), false);
});

test("first input starts from initialState and is persisted to storage.local (R33)", async () => {
  const { chrome, dispatch } = setup();
  const r = await dispatch({ type: "landing" });
  assert.equal(r?.state.rev, 1);
  assert.deepEqual(chrome.storage.local.data.get("fg_engine"), r?.state);
  assert.equal(chrome.storage.session.data.has("fg_engine"), false);
});

test("state is persisted BEFORE effects run", async () => {
  /** @type {any} */ let seen = null;
  const { chrome, dispatch } = setup({
    runEffects: async (/** @type {any} */ _fx, /** @type {any} */ ctx) => {
      seen = { stored: (await chrome.storage.local.get("fg_engine")).fg_engine, ctx };
    },
  });
  const r = await dispatch({ type: "landing" });
  assert.deepEqual(seen.stored, r?.state);
  assert.equal(seen.ctx.prev.rev, 0);
  assert.equal(seen.ctx.state.rev, 1);
  assert.equal(typeof seen.ctx.now, "number");
});

test("inputs are serialized even when effects are slow", async () => {
  /** @type {number[]} */ const prevRevs = [];
  const { dispatch, getState } = setup({
    step: (/** @type {any} */ prev, /** @type {any} */ input, /** @type {number} */ now) => { prevRevs.push(prev.rev); return stubStep(prev, input, now); },
    runEffects: async () => { await sleep(10); },
  });
  await Promise.all([dispatch({ type: "a" }), dispatch({ type: "b" }), dispatch({ type: "c" })]);
  assert.deepEqual(prevRevs, [0, 1, 2]);
  assert.equal((await getState()).last, "c");
});

test("a throwing step leaves state unchanged and the queue alive", async () => {
  let boom = true;
  const { dispatch, getState } = setup({
    step: (/** @type {any} */ prev, /** @type {any} */ input, /** @type {number} */ now) => { if (boom) { boom = false; throw new Error("bug"); } return stubStep(prev, input, now); },
  });
  assert.equal(await dispatch({ type: "x" }), null);
  assert.equal((await dispatch({ type: "y" }))?.state.rev, 1);
  assert.equal((await getState()).last, "y");
});

test("a throwing runEffects does not wedge the queue", async () => {
  let boom = true;
  const { dispatch } = setup({ runEffects: async () => { if (boom) { boom = false; throw new Error("executor bug"); } } });
  assert.equal(await dispatch({ type: "x" }), null);
  assert.equal((await dispatch({ type: "y" }))?.state.rev, 2);
});

test("getState works before consent (popup get_view)", async () => {
  const { getState } = setup({ consent: false });
  assert.equal((await getState()).phase, "idle");
});

test("buildCfg: DEFAULTS < user settings < dev overrides; relatedRules stay out (R21, R34)", () => {
  const defaults = { GRACE_DEFAULT_S: 300, DWELL_MIN_S: 4 };
  const settings = { grace_s: 420, quiet_hours: [{ from: "22:00", to: "07:00" }], aiMode: "off", beastUntil: 5, relatedRules: [{ host: "a.com" }], extraSensitive: [], tz: "Asia/Kathmandu" };
  const seed = { version: 1, labels: {}, domains: {} };
  const cache = { "x.com|c1": { tier: "neutral" } };
  assert.deepEqual(buildCfg(defaults, settings, { seed, cache }), {
    GRACE_DEFAULT_S: 420, DWELL_MIN_S: 4, tz: "Asia/Kathmandu", quietHours: [{ from: "22:00", to: "07:00" }],
    beastUntil: 5, tables: { seed, cache },
  });
  assert.equal(buildCfg(defaults, settings, { overrides: { GRACE_DEFAULT_S: 60 } }).GRACE_DEFAULT_S, 60);
});
