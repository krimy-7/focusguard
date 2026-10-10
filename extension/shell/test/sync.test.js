// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSync, dayKey, applyRecord, snapshot } from "../sync.js";
import { fakeChrome, fakeFetch, jsonResponse } from "./fake-chrome.js";

const TZ = "Asia/Kathmandu";
const T0 = Date.UTC(2026, 9, 10, 6, 0, 0); // 11:45 local on 2026-10-10
const ZERO = { focus_s: 0, nudges: 0, self_returns: 0, recoveries: 0, snoozes: 0, breaks: 0, longest_detour_s: 0 };
const CTX = {
  id: "ctx_1", title: "FocusGuard landing", mode: "work", confidence: "confirmed", startedAt: T0, groupId: 7, groupTabIds: [1], lastTabId: 1, relatedHosts: [],
  resources: [{ host: "figma.com", label: "Landing v3", lastSeen: T0, visits: 2 }, { host: "pinterest.com", label: "Design reference", lastSeen: T0, visits: 1 }],
};
/** @param {number} at @param {Record<string, any>} [over] */
const active = (at, over = {}) => ({ phase: "active", ctx: CTX, current: { tabId: 1, host: "figma.com", title: "Landing v3 – Figma", tier: "green", inCtx: true, at }, pausedUntil: null, idle: false, lastSeenAt: at, ...over });
const rec = (/** @type {string} */ id, /** @type {Record<string, any>} */ r) => ({ type: "sync", rec: { id, ...r } });
const jwt = (/** @type {string} */ sub) => `h.${btoa(JSON.stringify({ sub }))}.s`;

/** @param {{handler?:(url:string, init:any)=>any, getAccessToken?:(o?:{force?:boolean})=>Promise<string|null>, signOut?:()=>Promise<void>}} [o] */
function setup({ handler, getAccessToken, signOut } = {}) {
  const chrome = fakeChrome();
  const clock = { t: T0 };
  const auth = { token: /** @type {string|null} */ ("tok") };
  const fetch = fakeFetch(handler ?? (() => jsonResponse(200, {})));
  const sync = createSync({
    chrome, fetch, getAccessToken: getAccessToken ?? (async () => auth.token), signOut, getSettings: async () => ({ tz: TZ }), getDeviceId: async () => "dev-1",
    apiUrl: () => "http://api", now: () => clock.t, log: () => {},
  });
  /** @param {any} prev @param {any} state @param {any[]} [effects] */
  const observe = async (prev, state, effects = []) => {
    await sync.observe({ prev, state, now: clock.t }, effects);
    await sync.settled();
  };
  const puts = (/** @type {string} */ part) => fetch.log.filter((l) => l.init.method === "PUT" && l.url.includes(part)).map((l) => JSON.parse(l.init.body));
  return { chrome, clock, auth, fetch, sync, observe, puts };
}

test("dayKey is the user's local day (UTC+5:45 around midnight)", () => {
  assert.equal(dayKey(Date.UTC(2026, 9, 9, 18, 20), TZ), "2026-10-10"); // 00:05 local
  assert.equal(dayKey(Date.UTC(2026, 9, 9, 18, 10), TZ), "2026-10-09"); // 23:55 local
});

test("applyRecord folds records into absolute totals; focus_s comes from engine focus records (R32)", () => {
  const t = { ...ZERO };
  for (const r of [
    { kind: "intervention" }, { kind: "intervention", suppressed: "hourly_cap" },
    { kind: "response", response: "extend" }, { kind: "response", response: "back" },
    { kind: "recovery", trigger: "self_returned", awayS: 180 }, { kind: "recovery", trigger: "intervention", awayS: 400 },
    { kind: "break" }, { kind: "drift" }, { kind: "context" }, { kind: "session_end" },
    { kind: "focus", seconds: 30 }, { kind: "focus", focusS: 15 },
  ]) applyRecord(t, r);
  assert.deepEqual(t, { focus_s: 45, nudges: 1, self_returns: 1, recoveries: 1, snoozes: 1, breaks: 1, longest_detour_s: 400 });
});

test("snapshot holds hostnames only, maps phase → state, drops hosts the backend would reject", () => {
  assert.deepEqual(snapshot(CTX, "grace", "dev-1", T0 + 1000), {
    id: "ctx_1", device_id: "dev-1", title: "FocusGuard landing", mode: "work", state: "grace", confidence: "confirmed",
    started_at: new Date(T0).toISOString(), ended_at: null, last_active_at: new Date(T0 + 1000).toISOString(), sites: ["figma.com", "pinterest.com"],
  });
  const ended = snapshot(CTX, "active", "dev-1", T0 + 2000, true);
  assert.equal(ended.state, "ended");
  assert.equal(ended.ended_at, new Date(T0 + 2000).toISOString());
  const odd = { ...CTX, resources: [{ host: "[::1]" }, { host: "my_app.example.com" }, { host: "figma.com" }] };
  assert.deepEqual(snapshot(odd, "active", "dev-1", T0).sites, ["figma.com"]);
});

test("a host the user marks extra-sensitive mid-context stops being uploaded", async () => {
  const chrome = fakeChrome();
  const fetch = fakeFetch(() => jsonResponse(200, {}));
  const sync = createSync({
    chrome, fetch, getAccessToken: async () => "tok", getSettings: async () => ({ tz: TZ, extraSensitive: ["mycorp.internal"] }),
    getDeviceId: async () => "dev-1", apiUrl: () => "http://api", now: () => T0, log: () => {},
  });
  const ctx = { ...CTX, resources: [{ host: "hr.mycorp.internal" }, { host: "figma.com" }, { host: "chase.com" }] };
  await sync.observe({ prev: { phase: "detected", ctx: null }, state: active(T0, { ctx }), now: T0 }, []);
  await sync.settled();
  const sent = fetch.log.filter((l) => l.init.method === "PUT" && l.url.includes("/contexts/")).map((l) => JSON.parse(l.init.body));
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].sites, ["figma.com"]);
});

test("PUT /contexts on first sight and on change only", async () => {
  const { clock, observe, puts } = setup();
  await observe({ phase: "detected", ctx: null }, active(T0));
  assert.equal(puts("/contexts/").length, 1);
  assert.equal(puts("/contexts/")[0].state, "active");
  clock.t += 60_000;
  await observe(active(T0), active(clock.t));
  assert.equal(puts("/contexts/").length, 1); // only last_active_at moved, and less than 10 min ago
  clock.t += 60_000;
  await observe(active(clock.t - 60_000), active(clock.t, { phase: "grace" }));
  assert.equal(puts("/contexts/").length, 2);
  assert.equal(puts("/contexts/")[1].state, "grace");
});

test("R6: an unchanged context is re-PUT every 10 min so last_active_at stays fresh", async () => {
  const { clock, observe, puts } = setup();
  await observe({ phase: "detected", ctx: null }, active(T0));
  for (let i = 0; i < 9; i++) {
    clock.t += 60_000;
    await observe(active(clock.t - 60_000), active(clock.t));
  }
  assert.equal(puts("/contexts/").length, 1);
  clock.t += 60_000; // T0 + 10 min
  await observe(active(clock.t - 60_000), active(clock.t));
  assert.equal(puts("/contexts/").length, 2);
  assert.equal(puts("/contexts/")[1].last_active_at, new Date(T0 + 600_000).toISOString());
});

test("duplicate record ids count once", async () => {
  const { chrome, observe } = setup();
  const fx = [rec("r1", { kind: "break" })];
  await observe({ phase: "idle", ctx: null }, { phase: "idle", ctx: null }, fx);
  await observe({ phase: "idle", ctx: null }, { phase: "idle", ctx: null }, fx);
  assert.equal(chrome.storage.local.data.get("fg_accum:2026-10-10").totals.breaks, 1);
});

test("PUT /daily at most every 5 minutes, with absolute totals", async () => {
  const { clock, sync, observe, puts } = setup();
  await observe({ phase: "detected", ctx: null }, active(T0), [rec("r1", { kind: "intervention" })]);
  assert.equal(puts("/daily/").length, 1);
  clock.t += 60_000;
  await observe(active(T0), active(clock.t), [rec("r2", { kind: "intervention" }), rec("f1", { kind: "focus", seconds: 60, day: "2026-10-10" })]);
  await sync.flush();
  assert.equal(puts("/daily/").length, 1);
  clock.t += 5 * 60_000;
  await sync.flush();
  const daily = puts("/daily/");
  assert.equal(daily.length, 2);
  assert.deepEqual(daily[1], { day: "2026-10-10", device_id: "dev-1", ...ZERO, nudges: 2, focus_s: 60 });
});

test("R32: records are filed under rec.day, so the old day's final records land on the old day", async () => {
  const { chrome, auth, clock, observe } = setup();
  auth.token = null; // keep the accumulators local so they can be inspected
  clock.t = Date.UTC(2026, 9, 9, 18, 15, 5); // 00:00:05 local on 2026-10-10
  await observe({ phase: "active", ctx: null }, { phase: "idle", ctx: null }, [
    rec("e1", { kind: "session_end", contextId: "ctx_1", day: "2026-10-09" }),
    rec("f1", { kind: "focus", seconds: 30, day: "2026-10-09" }),
    rec("f2", { kind: "focus", seconds: 5, day: "2026-10-10" }),
  ]);
  const old = chrome.storage.local.data.get("fg_accum:2026-10-09");
  assert.equal(old.totals.focus_s, 30);
  assert.deepEqual(old.seen, ["e1", "f1"]);
  assert.equal(chrome.storage.local.data.get("fg_accum:2026-10-10").totals.focus_s, 5);
});

test("session end uploads the ended snapshot and forces the daily totals", async () => {
  const { clock, observe, puts } = setup();
  await observe({ phase: "detected", ctx: null }, active(T0));
  clock.t += 60_000;
  await observe(active(T0), active(clock.t, { phase: "active" }), [rec("r1", { kind: "break" })]);
  clock.t += 30_000;
  await observe(active(clock.t - 30_000), { phase: "idle", ctx: null, current: null }, [rec("r2", { kind: "session_end" })]);
  const ctxPuts = puts("/contexts/");
  assert.equal(ctxPuts.at(-1).state, "ended");
  assert.ok(ctxPuts.at(-1).ended_at);
  assert.equal(puts("/daily/").at(-1).breaks, 1);
});

test("offline for a day: backoff with fg_sync alarm, then one absolute upload, no double counting", async () => {
  let online = false;
  const { chrome, clock, sync, observe, puts, fetch } = setup({ handler: () => { if (!online) throw new TypeError("Failed to fetch"); return jsonResponse(200, {}); } });
  await observe({ phase: "detected", ctx: null }, active(T0), [rec("r1", { kind: "intervention" })]);
  let a = chrome.storage.local.data.get("fg_accum:2026-10-10");
  assert.deepEqual(a.retry, { n: 1, at: T0 + 30_000 });
  assert.equal(chrome.alarms.map.get("fg_sync").scheduledTime, T0 + 30_000);
  const tries = fetch.log.length;
  await sync.flush(); // still inside backoff window
  assert.equal(fetch.log.length, tries);
  clock.t += 30_000;
  await sync.flush();
  a = chrome.storage.local.data.get("fg_accum:2026-10-10");
  assert.deepEqual(a.retry, { n: 2, at: clock.t + 60_000 });
  clock.t += 60_000;
  await observe(active(T0), active(clock.t), [rec("r2", { kind: "recovery", trigger: "self_returned", awayS: 90 })]);
  online = true;
  clock.t += 60_000;
  await sync.flush();
  const daily = puts("/daily/").filter((_, i, arr) => i === arr.length - 1);
  assert.equal(daily[0].nudges, 1);
  assert.equal(daily[0].self_returns, 1);
  assert.equal(chrome.storage.local.data.get("fg_accum:2026-10-10").retry, null);
  const n = fetch.log.length;
  clock.t += 10 * 60_000;
  await sync.flush();
  assert.equal(fetch.log.length, n); // nothing new → nothing sent
});

test("a context PUT rejected with 422 is dropped and never blocks the daily totals", async () => {
  const { chrome, clock, sync, observe, puts } = setup({ handler: (url) => jsonResponse(url.includes("/contexts/") ? 422 : 200, {}) });
  clock.t = Date.UTC(2026, 9, 10, 18, 14); // 23:59 local on the 10th
  await observe({ phase: "detected", ctx: null }, active(clock.t), [rec("r1", { kind: "intervention" })]);
  assert.equal(puts("/daily/").length, 1);
  assert.equal(chrome.alarms.map.has("fg_sync"), false);
  assert.equal(chrome.storage.local.data.get("fg_accum:2026-10-10").retry, null);
  const ctxTries = puts("/contexts/").length;
  clock.t += 2 * 60_000; // 00:01 local on the 11th
  await sync.flush({ force: true });
  assert.equal(puts("/contexts/").length, ctxTries); // the rejected snapshot is not resent
  assert.equal(chrome.storage.local.data.has("fg_accum:2026-10-10"), false); // past day cleaned up
});

test("401: the token is force-refreshed once and the PUT retried (spec §6)", async () => {
  /** @type {boolean[]} */ const forced = [];
  const { chrome, fetch, observe } = setup({
    handler: (_url, init) => jsonResponse(init.headers.Authorization === "Bearer fresh" ? 200 : 401, {}),
    getAccessToken: async (o) => { forced.push(!!o?.force); return o?.force ? "fresh" : "tok"; },
  });
  await observe({ phase: "detected", ctx: null }, active(T0), [rec("r1", { kind: "intervention" })]);
  assert.deepEqual(forced, [false, true]);
  assert.equal(fetch.log.at(-1)?.init.headers.Authorization, "Bearer fresh");
  assert.equal(chrome.storage.local.data.get("fg_accum:2026-10-10").retry, null);
});

test("401 again with a fresh token: signed out once, no further PUTs, data kept (spec §6)", async () => {
  let signOuts = 0;
  const { chrome, fetch, observe } = setup({
    handler: () => jsonResponse(401, {}),
    getAccessToken: async (o) => (o?.force ? "fresh" : "tok"),
    signOut: async () => { signOuts++; },
  });
  await observe({ phase: "detected", ctx: null }, active(T0), [rec("r1", { kind: "intervention" })]);
  assert.equal(signOuts, 1);
  assert.equal(fetch.log.length, 2); // the context PUT and its one retry; the daily PUT is never tried
  const a = chrome.storage.local.data.get("fg_accum:2026-10-10");
  assert.equal(a.totals.nudges, 1); // kept: uploaded after the user signs in again
  assert.equal(a.retry, null); // no backoff waiting after re-auth
  assert.equal(chrome.alarms.map.has("fg_sync"), false);
});

test("401 while the token cannot be refreshed (offline, GoTrue down): back off, never sign out", async () => {
  let signOuts = 0;
  const { chrome, observe } = setup({
    handler: () => jsonResponse(401, {}),
    getAccessToken: async (o) => (o?.force ? null : "tok"),
    signOut: async () => { signOuts++; },
  });
  await observe({ phase: "detected", ctx: null }, active(T0), [rec("r1", { kind: "intervention" })]);
  assert.equal(signOuts, 0);
  assert.deepEqual(chrome.storage.local.data.get("fg_accum:2026-10-10").retry, { n: 1, at: T0 + 30_000 });
});

test("signed out: nothing is sent, data is kept, sign-in uploads it", async () => {
  const { auth, sync, observe, puts, fetch } = setup();
  auth.token = null;
  await observe({ phase: "detected", ctx: null }, active(T0), [rec("r1", { kind: "intervention" })]);
  assert.equal(fetch.log.length, 0);
  auth.token = "tok";
  await sync.flush();
  assert.equal(puts("/contexts/").length, 1);
  assert.equal(puts("/daily/")[0].nudges, 1);
});

test("another account's token never uploads the cached account's data", async () => {
  const { chrome, auth, sync, observe, fetch } = setup();
  chrome.storage.local.data.set("fg_settings_cache", { at: 1, profile: { user_id: "u1", tz: TZ, settings: {} } });
  auth.token = jwt("u2");
  await observe({ phase: "detected", ctx: null }, active(T0), [rec("r1", { kind: "intervention" })]);
  assert.equal(fetch.log.length, 0);
  assert.ok(chrome.storage.local.data.has("fg_accum:2026-10-10")); // kept; refreshSettings purges it on the account switch (Task 5)
  auth.token = jwt("u1");
  await sync.flush();
  assert.ok(fetch.log.length > 0);
});

test("previous day is uploaded after midnight and then removed", async () => {
  const { chrome, clock, observe, puts } = setup();
  clock.t = Date.UTC(2026, 9, 10, 18, 14); // 23:59 local on the 10th
  await observe({ phase: "detected", ctx: null }, active(clock.t), [rec("r1", { kind: "intervention" })]);
  clock.t += 2 * 60_000; // 00:01 local on the 11th
  await observe(active(clock.t - 120_000), active(clock.t), [rec("r2", { kind: "intervention" })]);
  assert.ok(puts("/daily/").some((b) => b.day === "2026-10-10"));
  assert.equal(chrome.storage.local.data.has("fg_accum:2026-10-10"), false);
  assert.ok(chrome.storage.local.data.has("fg_accum:2026-10-11"));
});

test("privacy: uploads carry hostnames only — no URLs, page titles, labels or drift hosts", async () => {
  const { clock, observe, fetch } = setup();
  await observe({ phase: "detected", ctx: null }, active(T0));
  clock.t += 60_000;
  const drifting = active(clock.t, { phase: "grace", current: { tabId: 2, host: "reddit.com", title: "Secret thread title", tier: "red", inCtx: false, at: clock.t } });
  await observe(active(T0), drifting, [rec("r1", { kind: "drift", tier: "red" })]);
  clock.t += 6 * 60_000;
  await observe(drifting, { ...drifting, phase: "idle", ctx: null }, [rec("r2", { kind: "session_end" })]);
  const bodies = fetch.log.map((l) => String(l.init.body)).join("\n");
  assert.ok(bodies.length > 0);
  for (const bad of ["reddit", "Secret thread", "Landing v3", "Design reference", "http"]) assert.ok(!bodies.includes(bad), bad);
});

test("a record observed during a slow upload is not lost", async () => {
  /** @type {(v?:unknown)=>void} */ let release = () => {};
  const gate = new Promise((r) => { release = r; });
  let slow = true;
  const { chrome, clock, sync, puts } = setup({ handler: async () => { if (slow) { slow = false; await gate; } return jsonResponse(200, {}); } });
  const flushing = sync.observe({ prev: { phase: "detected", ctx: null }, state: active(T0), now: clock.t }, [rec("r1", { kind: "intervention" })]);
  await flushing;
  await sync.observe({ prev: active(T0), state: active(T0), now: clock.t }, [rec("r2", { kind: "intervention" })]);
  release();
  await sync.settled();
  const a = chrome.storage.local.data.get("fg_accum:2026-10-10");
  assert.equal(a.totals.nudges, 2);
  assert.ok(a.ver > a.sentVer, "second record still marked unsent");
  clock.t += 5 * 60_000;
  await sync.flush();
  assert.equal(puts("/daily/").at(-1).nudges, 2);
});
