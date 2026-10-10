// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHints, MISS_TTL_MS } from "../hints.js";
import { fakeChrome } from "./fake-chrome.js";

function deferred() {
  /** @type {(v:any)=>void} */ let resolve = () => {};
  /** @type {(e:any)=>void} */ let reject = () => {};
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const state = (tier = "unknown") => ({ ctx: { id: "c1", title: "Thesis" }, current: { tabId: 3, host: "obscure.dev", title: "Some page", tier, inCtx: false } });

/** @param {{aiMode?:string, classify?:Function}} [o] */
function setup({ aiMode = "key", classify } = {}) {
  const chrome = fakeChrome();
  chrome.storage.local.data.set("fg_engine", { ctx: { id: "c1", title: "Thesis" } }); // the live context (R33)
  /** @type {any[]} */ const asked = [];
  /** @type {any[]} */ const sent = [];
  const d = deferred();
  const hints = createHints({
    chrome,
    classify: /** @type {any} */ (classify ?? ((/** @type {any} */ q) => { asked.push(q); return d.promise; })),
    getSettings: async () => ({ aiMode }),
    dispatch: async (/** @type {any} */ i) => { sent.push(i); },
    log: () => {},
  });
  return { chrome, hints, asked, sent, d };
}

test("unknown landing → classify runs without blocking → tier_hint dispatched and cached", async () => {
  const { chrome, hints, asked, sent, d } = setup();
  await hints.afterStep({ prev: {}, state: state(), now: 1 });
  assert.deepEqual(asked, [{ host: "obscure.dev", title: "Some page", contextTitle: "Thesis" }]);
  assert.equal(sent.length, 0); // afterStep returned while the AI is still thinking
  d.resolve({ tier: "green", related: true });
  await hints.idle();
  assert.deepEqual(sent, [{ type: "tier_hint", host: "obscure.dev", tier: "green", related: true }]);
  assert.deepEqual(chrome.storage.local.data.get("fg_tier_cache"), { "obscure.dev|c1": { tier: "green", related: true } });
});

test("never asks twice for the same host|context (in flight or cached)", async () => {
  const { hints, asked, d } = setup();
  await hints.afterStep({ prev: {}, state: state(), now: 1 });
  await hints.afterStep({ prev: {}, state: state(), now: 2 });
  d.resolve({ tier: "red", related: false });
  await hints.idle();
  await hints.afterStep({ prev: {}, state: state(), now: 3 });
  assert.equal(asked.length, 1);
});

test("AI off, known tiers, blind landings or no context → no request", async () => {
  const off = setup({ aiMode: "off" });
  await off.hints.afterStep({ prev: {}, state: state(), now: 1 });
  assert.equal(off.asked.length, 0);
  const on = setup();
  await on.hints.afterStep({ prev: {}, state: state("green"), now: 1 });
  await on.hints.afterStep({ prev: {}, state: { ctx: { id: "c1", title: "T" }, current: { tabId: 1, host: null, title: "", tier: "unknown" } }, now: 1 });
  await on.hints.afterStep({ prev: {}, state: { ctx: null, current: state().current }, now: 1 });
  assert.equal(on.asked.length, 0);
});

test("null answer is not dispatched or stored; asked again only after MISS_TTL_MS", async () => {
  /** @type {any[]} */ const asked = [];
  const { chrome, hints, sent } = setup({ classify: async (/** @type {any} */ q) => { asked.push(q); return null; } });
  await hints.afterStep({ prev: {}, state: state(), now: 1 });
  await hints.idle();
  assert.equal(sent.length, 0);
  assert.equal(chrome.storage.local.data.has("fg_tier_cache"), false);
  await hints.afterStep({ prev: {}, state: state(), now: 2 }); // inside the TTL: no repeat request
  await hints.afterStep({ prev: {}, state: state(), now: 1 + MISS_TTL_MS }); // e.g. the user fixed the AI option
  await hints.idle();
  assert.equal(asked.length, 2);
});

test("an answer that arrives after the context changed is cached but not dispatched", async () => {
  const { chrome, hints, sent, d } = setup();
  await hints.afterStep({ prev: {}, state: state(), now: 1 });
  chrome.storage.local.data.set("fg_engine", { ctx: { id: "c2", title: "New task" } }); // new task while classify ran
  d.resolve({ tier: "green", related: true });
  await hints.idle();
  assert.equal(sent.length, 0); // tier_hint has no contextId; A would apply it to c2
  assert.deepEqual(chrome.storage.local.data.get("fg_tier_cache"), { "obscure.dev|c1": { tier: "green", related: true } });
});

test("classify throwing is swallowed and not cached (retried next landing)", async () => {
  const { chrome, hints, sent, d, asked } = setup();
  await hints.afterStep({ prev: {}, state: state(), now: 1 });
  d.reject(new Error("timeout"));
  await hints.idle();
  assert.equal(sent.length, 0);
  assert.equal(chrome.storage.local.data.has("fg_tier_cache"), false);
  await hints.afterStep({ prev: {}, state: state(), now: 2 });
  assert.equal(asked.length, 2);
});

test("cache is capped at 500 entries (oldest dropped)", async () => {
  const { chrome, hints, d } = setup();
  /** @type {Record<string, any>} */ const big = {};
  for (let i = 0; i < 500; i++) big[`h${i}.com|c1`] = null;
  chrome.storage.local.data.set("fg_tier_cache", big);
  await hints.afterStep({ prev: {}, state: state(), now: 1 });
  d.resolve({ tier: "yellow", related: false });
  await hints.idle();
  const cache = chrome.storage.local.data.get("fg_tier_cache");
  assert.equal(Object.keys(cache).length, 500);
  assert.ok(!("h0.com|c1" in cache));
  assert.ok("obscure.dev|c1" in cache);
});
