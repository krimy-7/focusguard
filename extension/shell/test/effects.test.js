// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { createEffects } from "../effects.js";
import { createDispatch } from "../dispatch.js";
import { fakeChrome, callsOf } from "./fake-chrome.js";

const T = 1_000_000;
/** @param {Record<string, any>} [ctx] */
function ctxState(ctx = {}) {
  return {
    phase: "active", current: null,
    ctx: { id: "c1", title: "Landing page", mode: "work", confidence: "confirmed", startedAt: 0, groupId: null, groupTabIds: [], lastTabId: null, relatedHosts: [], resources: [], ...ctx },
  };
}
/** @param {any} fx @param {any[]} effects @param {any} [state] */
const run = (fx, effects, state = ctxState()) => fx.runEffects(effects, { prev: state, state, now: T });

test("schedule_alarm names the alarm kind@at and replaces the previous one of that kind", async () => {
  const chrome = fakeChrome();
  const fx = createEffects({ chrome });
  await run(fx, [{ type: "schedule_alarm", kind: "grace", at: T + 300_000 }]);
  await run(fx, [{ type: "schedule_alarm", kind: "grace", at: T + 360_000 }]);
  assert.deepEqual([...chrome.alarms.map.keys()].filter((n) => n.startsWith("grace")), [`grace@${T + 360_000}`]);
  assert.equal(chrome.alarms.map.get(`grace@${T + 360_000}`).scheduledTime, T + 360_000);
});

test("cancel_alarm clears only that kind", async () => {
  const chrome = fakeChrome();
  const fx = createEffects({ chrome });
  await run(fx, [{ type: "schedule_alarm", kind: "grace", at: 5 }, { type: "schedule_alarm", kind: "escalate", at: 6 }, { type: "cancel_alarm", kind: "escalate" }]);
  assert.ok(chrome.alarms.map.has("grace@5"));
  assert.ok(!chrome.alarms.map.has("escalate@6"));
});

test("heartbeat alarm exists exactly while a context exists", async () => {
  const chrome = fakeChrome();
  const fx = createEffects({ chrome });
  await run(fx, []);
  assert.equal(chrome.alarms.map.get("heartbeat").periodInMinutes, 1);
  await run(fx, [], { phase: "idle", ctx: null, current: null });
  assert.equal(chrome.alarms.map.has("heartbeat"), false);
});

test("restart: the startup heartbeat re-derives engine alarms from persisted state; beast:* and fg_sync untouched", async () => {
  const chrome = fakeChrome();
  chrome.storage.local.data.set("fg_consent", { at: 1, version: 1 });
  chrome.storage.local.data.set("fg_engine", { ...ctxState(), phase: "grace", drift: { deadline: 900_000 } });
  chrome.storage.session.data.clear(); // a browser restart wipes storage.session; fg_engine (storage.local, R33) survives
  for (const n of ["grace@1", "beast:end", "beast:bypass:9500", "fg_sync"]) await chrome.alarms.create(n, { when: 1 });
  const fx = createEffects({ chrome });
  // Stub engine: a startup heartbeat re-emits the drift's alarm (engine notes §2); schedule_alarm replaces grace@1.
  const step = (/** @type {any} */ prev, /** @type {any} */ input) => ({
    state: prev,
    effects: input.reason === "startup" && prev.drift ? [{ type: "schedule_alarm", kind: "grace", at: prev.drift.deadline }] : [],
  });
  const { dispatch } = createDispatch({ step, initialState: () => ({}), chrome, getCfg: async () => ({}), runEffects: fx.runEffects, now: () => 700_000 });
  await dispatch({ type: "heartbeat", reason: "startup" });
  assert.equal(chrome.alarms.map.get("grace@900000").scheduledTime, 900_000);
  assert.ok(chrome.alarms.map.has("heartbeat"));
  assert.deepEqual([...chrome.alarms.map.keys()].sort(), ["beast:bypass:9500", "beast:end", "fg_sync", "grace@900000", "heartbeat"]);
  assert.equal(chrome.storage.local.data.get("fg_engine").ctx.id, "c1"); // the context survived the restart
});

test("update (onInstalled): rearm rebuilds engine alarms without stepping or touching state", async () => {
  const chrome = fakeChrome();
  const state = { ...ctxState(), phase: "grace", drift: { deadline: 900_000 } };
  chrome.storage.local.data.set("fg_engine", state);
  for (const n of ["grace@1", "escalate@2", "heartbeat@3", "beast:end", "fg_sync"]) await chrome.alarms.create(n, { when: 1 });
  const fx = createEffects({ chrome });
  await fx.rearm(state, { grace: 900_000 }); // = A's alarmsFor(state)
  assert.deepEqual([...chrome.alarms.map.keys()].sort(), ["beast:end", "fg_sync", "grace@900000", "heartbeat"]);
  assert.equal(chrome.alarms.map.get("heartbeat").periodInMinutes, 1);
  assert.equal(callsOf(chrome, "storage.local.set").length, 0); // engine not stepped: tab/group ids in ctx are kept
  await fx.rearm(null, {}); // fresh install: nothing persisted yet
  assert.deepEqual([...chrome.alarms.map.keys()].sort(), ["beast:end", "fg_sync"]);
});

test("group_tab creates a titled, mode-coloured group when the context has none", async () => {
  const chrome = fakeChrome();
  const tab = chrome.tabs.add({ url: "https://github.com/a/b" });
  await run(createEffects({ chrome }), [{ type: "group_tab", contextId: "c1", tabId: tab.id, title: "Landing page" }]);
  const gid = chrome.tabs.map.get(tab.id).groupId;
  assert.notEqual(gid, -1);
  assert.deepEqual(chrome.tabGroups.map.get(gid), { id: gid, title: "Landing page", color: "blue" });
});

test("group_tab adds to the context's existing group without renaming it", async () => {
  const chrome = fakeChrome();
  const a = chrome.tabs.add({ url: "https://github.com/a" });
  const gid = await chrome.tabs.group({ tabIds: [a.id] });
  const b = chrome.tabs.add({ url: "https://youtube.com/watch" });
  await run(createEffects({ chrome }), [{ type: "group_tab", contextId: "c1", tabId: b.id, title: "Landing page" }], ctxState({ groupId: gid }));
  assert.equal(chrome.tabs.map.get(b.id).groupId, gid);
  assert.equal(callsOf(chrome, "tabGroups.update").length, 0);
});

test("group_tab into a vanished group makes a new one", async () => {
  const chrome = fakeChrome();
  const tab = chrome.tabs.add({ url: "https://github.com/a" });
  await run(createEffects({ chrome }), [{ type: "group_tab", contextId: "c1", tabId: tab.id, title: "Landing page" }], ctxState({ groupId: 999 }));
  const gid = chrome.tabs.map.get(tab.id).groupId;
  assert.notEqual(gid, -1);
  assert.notEqual(gid, 999);
  assert.equal(chrome.tabGroups.map.get(gid).title, "Landing page");
});

test("persist_resume stores ≤20 web tabs of the group, the group colour and the last URL", async () => {
  const chrome = fakeChrome();
  const first = chrome.tabs.add({ url: "https://figma.com/file/x", title: "Landing v3" });
  const gid = await chrome.tabs.group({ tabIds: [first.id] });
  chrome.tabGroups.map.get(gid).color = "cyan";
  const internal = chrome.tabs.add({ url: "chrome://newtab/", groupId: gid });
  for (let i = 0; i < 25; i++) chrome.tabs.add({ url: `https://pinterest.com/p/${i}`, title: `Pin ${i}`, groupId: gid });
  await run(createEffects({ chrome }), [{ type: "persist_resume", contextId: "c1" }], ctxState({ groupId: gid, lastTabId: first.id }));
  const r = chrome.storage.local.data.get("fg_resume:c1");
  assert.equal(r.contextId, "c1");
  assert.equal(r.savedAt, T);
  assert.equal(r.groupId, gid);
  assert.equal(r.color, "cyan");
  assert.equal(r.title, "Landing page");
  assert.equal(r.lastTabId, first.id);
  assert.equal(r.lastUrl, "https://figma.com/file/x");
  assert.equal(r.tabs.length, 20);
  assert.deepEqual(r.tabs[0], { url: "https://figma.com/file/x", title: "Landing v3", pinned: false });
  assert.ok(!r.tabs.some((/** @type {any} */ t) => t.url === internal.url));
});

test("persist_resume without a group keeps the last tab", async () => {
  const chrome = fakeChrome();
  const last = chrome.tabs.add({ url: "https://docs.google.com/d/1", title: "Doc" });
  await run(createEffects({ chrome }), [{ type: "persist_resume", contextId: "c1" }], ctxState({ lastTabId: last.id }));
  const r = chrome.storage.local.data.get("fg_resume:c1");
  assert.equal(r.groupId, null);
  assert.deepEqual(r.tabs, [{ url: "https://docs.google.com/d/1", title: "Doc", pinned: false }]);
});

test("focus_tab activates the tab and focuses its window", async () => {
  const chrome = fakeChrome();
  const tab = chrome.tabs.add({ url: "https://figma.com", windowId: 3 });
  await run(createEffects({ chrome }), [{ type: "focus_tab", contextId: "c1", tabId: tab.id }]);
  assert.deepEqual(callsOf(chrome, "tabs.update")[0], ["tabs.update", tab.id, { active: true }]);
  assert.deepEqual(callsOf(chrome, "windows.update")[0], ["windows.update", 3, { focused: true }]);
});

test("focus_tab on a closed tab falls back to an open tab with the resume URL", async () => {
  const chrome = fakeChrome();
  const other = chrome.tabs.add({ url: "https://figma.com/file/x" });
  chrome.storage.local.data.set("fg_resume:c1", { contextId: "c1", lastUrl: "https://figma.com/file/x", tabs: [], title: "Landing page", color: "blue" });
  await run(createEffects({ chrome }), [{ type: "focus_tab", contextId: "c1", tabId: 4242 }]);
  assert.equal(chrome.tabs.map.get(other.id).active, true);
  assert.equal(callsOf(chrome, "tabs.create").length, 0);
});

test("focus_tab with nothing open reopens the group (reusing already-open URLs)", async () => {
  const chrome = fakeChrome();
  const open = chrome.tabs.add({ url: "https://pinterest.com/p/1" });
  chrome.storage.local.data.set("fg_resume:c1", {
    contextId: "c1", savedAt: 1, windowId: 1, groupId: 7, title: "Landing page", color: "cyan", lastTabId: 1, lastUrl: "https://figma.com/file/x",
    tabs: [{ url: "https://figma.com/file/x", title: "Landing v3", pinned: false }, { url: "https://pinterest.com/p/1", title: "Pin", pinned: false }],
  });
  await run(createEffects({ chrome }), [{ type: "focus_tab", contextId: "c1", tabId: null }]);
  assert.equal(callsOf(chrome, "tabs.create").length, 1);
  const created = [...chrome.tabs.map.values()].find((t) => t.url === "https://figma.com/file/x");
  assert.ok(created);
  const gid = created.groupId;
  assert.equal(chrome.tabs.map.get(open.id).groupId, gid);
  assert.deepEqual(chrome.tabGroups.map.get(gid), { id: gid, title: "Landing page", color: "cyan" });
  assert.equal(created.active, true);
});

test("reopen_group without a resume target only logs", async () => {
  const chrome = fakeChrome();
  /** @type {any[]} */ const logs = [];
  await run(createEffects({ chrome, log: (/** @type {any[]} */ ...a) => logs.push(a) }), [{ type: "reopen_group", contextId: "nope" }]);
  assert.equal(callsOf(chrome, "tabs.create").length, 0);
  assert.equal(logs.length, 1);
});

test("drop_resume deletes the target", async () => {
  const chrome = fakeChrome();
  chrome.storage.local.data.set("fg_resume:c1", { contextId: "c1" });
  await run(createEffects({ chrome }), [{ type: "drop_resume", contextId: "c1" }]);
  assert.equal(chrome.storage.local.data.has("fg_resume:c1"), false);
});

test("a failing effect is logged and later effects still run", async () => {
  const chrome = fakeChrome();
  chrome.storage.local.data.set("fg_resume:c1", { contextId: "c1" });
  /** @type {any[]} */ const logs = [];
  const fx = createEffects({ chrome, handlers: { boom: async () => { throw new Error("x"); } }, log: (/** @type {any[]} */ ...a) => logs.push(a) });
  await run(fx, [{ type: "boom" }, { type: "drop_resume", contextId: "c1" }, { type: "never_heard_of_it" }]);
  assert.equal(chrome.storage.local.data.has("fg_resume:c1"), false);
  assert.equal(logs.length, 2);
});

test("show_recovery runs after the tab effects; afterStep hooks run last with the effects", async () => {
  const chrome = fakeChrome();
  /** @type {string[]} */ const order = [];
  const fx = createEffects({
    chrome,
    handlers: { show_recovery: async () => { order.push("recovery"); }, reopen_group: async () => { order.push("reopen"); } },
    afterStep: [async (/** @type {any} */ _ctx, /** @type {any[]} */ effects) => { order.push(`after:${effects.length}`); }],
  });
  await run(fx, [{ type: "show_recovery" }, { type: "reopen_group", contextId: "c1" }]);
  assert.deepEqual(order, ["reopen", "recovery", "after:2"]);
});

test("sync rule records are remembered in fg_rules once per host + context (R26)", async () => {
  const chrome = fakeChrome();
  const fx = createEffects({ chrome });
  const rule = { type: "sync", rec: { id: "r1", kind: "rule", host: "youtube.com", contextId: "c1" } };
  await run(fx, [rule]);
  await run(fx, [rule]);
  assert.deepEqual(chrome.storage.local.data.get("fg_rules"), [{ host: "youtube.com", contextId: "c1", contextTitle: "Landing page", at: T }]);
  // Same title, different context → its own entry.
  await run(fx, [{ type: "sync", rec: { id: "r2", kind: "rule", host: "youtube.com", contextId: "c2" } }], ctxState({ id: "c2" }));
  assert.deepEqual(chrome.storage.local.data.get("fg_rules").map((/** @type {any} */ r) => r.contextId), ["c1", "c2"]);
});
