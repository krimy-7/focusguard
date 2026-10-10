// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSettings } from "../settings.js";
import { fakeChrome, fakeFetch, jsonResponse } from "./fake-chrome.js";

const PROFILE = { user_id: "u1", tz: "Asia/Kathmandu", settings: { grace_s: 420, quiet_hours: [{ from: "22:00", to: "07:00" }] } };
const apiUrl = () => "http://api";

test("defaults when nothing is cached", async () => {
  const s = await createSettings({ chrome: fakeChrome() }).getSettings();
  assert.equal(s.grace_s, 300);
  assert.deepEqual(s.quiet_hours, []);
  assert.equal(s.aiMode, "off");
  assert.equal(s.beastUntil, null);
  assert.deepEqual(s.relatedRules, []);
  assert.deepEqual(s.extraSensitive, []);
  assert.equal(typeof s.tz, "string");
  assert.ok(s.tz.length > 0);
});

test("reads the server cache plus extension-only keys", async () => {
  const chrome = fakeChrome();
  chrome.storage.local.data.set("fg_settings_cache", { at: 1, profile: PROFILE });
  chrome.storage.local.data.set("fg_ai", { mode: "nano" });
  chrome.storage.local.data.set("fg_beast", { until: 99 });
  chrome.storage.local.data.set("fg_rules", [{ host: "youtube.com", contextId: "c1", contextTitle: "React", at: 1 }]);
  chrome.storage.local.data.set("fg_extra_sensitive", ["mycorp.internal"]);
  assert.deepEqual(await createSettings({ chrome }).getSettings(), {
    grace_s: 420,
    quiet_hours: [{ from: "22:00", to: "07:00" }],
    aiMode: "nano",
    beastUntil: 99,
    relatedRules: [{ host: "youtube.com", contextId: "c1", contextTitle: "React", at: 1 }],
    extraSensitive: ["mycorp.internal"],
    tz: "Asia/Kathmandu",
  });
});

test("refresh skips while the cache is fresh", async () => {
  const chrome = fakeChrome();
  chrome.storage.local.data.set("fg_settings_cache", { at: 1000, profile: PROFILE });
  const fetch = fakeFetch(() => jsonResponse(200, PROFILE));
  const s = createSettings({ chrome, fetch, getAccessToken: async () => "tok", apiUrl, now: () => 1000 + 59 * 60_000 });
  assert.equal(await s.refreshSettings(), false);
  assert.equal(fetch.log.length, 0);
  assert.equal(await s.refreshSettings({ maxAgeMs: 60_000 }), true);
  assert.equal(fetch.log.length, 1);
});

test("forced refresh GETs /api/me with Bearer and stores the profile", async () => {
  const chrome = fakeChrome();
  const fetch = fakeFetch(() => jsonResponse(200, PROFILE));
  const s = createSettings({ chrome, fetch, getAccessToken: async () => "tok", apiUrl, now: () => 5 });
  assert.equal(await s.refreshSettings({ force: true }), true);
  assert.equal(fetch.log[0].url, "http://api/api/me");
  assert.equal(fetch.log[0].init.headers.Authorization, "Bearer tok");
  assert.deepEqual(chrome.storage.local.data.get("fg_settings_cache"), { at: 5, profile: PROFILE });
});

test("401 → one forced token refresh, then the GET is retried (spec §6)", async () => {
  const chrome = fakeChrome();
  const fetch = fakeFetch((_url, init) => jsonResponse(init.headers.Authorization === "Bearer fresh" ? 200 : 401, PROFILE));
  /** @type {any[]} */ const asked = [];
  const s = createSettings({ chrome, fetch, getAccessToken: async (o) => { asked.push(o ?? null); return o?.force ? "fresh" : "tok"; }, apiUrl, now: () => 5 });
  assert.equal(await s.refreshSettings({ force: true }), true);
  assert.deepEqual(asked, [null, { force: true }]);
  assert.equal(fetch.log.length, 2);
});

test("401 again with a fresh token → signed out once; a failed refresh is not a sign-out (spec §6)", async () => {
  let signOuts = 0;
  const signOut = async () => { signOuts++; };
  const s = createSettings({ chrome: fakeChrome(), fetch: fakeFetch(() => jsonResponse(401, {})), getAccessToken: async (o) => (o?.force ? "fresh" : "tok"), signOut, apiUrl });
  assert.equal(await s.refreshSettings({ force: true }), false);
  assert.equal(signOuts, 1);
  const noFresh = createSettings({ chrome: fakeChrome(), fetch: fakeFetch(() => jsonResponse(401, {})), getAccessToken: async (o) => (o?.force ? null : "tok"), signOut, apiUrl });
  assert.equal(await noFresh.refreshSettings({ force: true }), false);
  assert.equal(signOuts, 1);
});

test("another account signing in purges the previous account's local data", async () => {
  const chrome = fakeChrome();
  const old = ["fg_accum:2026-10-10", "fg_resume:c1", "fg_rules", "fg_engine"];
  chrome.storage.local.data.set("fg_settings_cache", { at: 1, profile: PROFILE });
  for (const k of old) chrome.storage.local.data.set(k, { x: 1 });
  chrome.storage.local.data.set("fg_consent", { at: 1, version: 1 });
  const s = createSettings({ chrome, fetch: fakeFetch(() => jsonResponse(200, { ...PROFILE, user_id: "u2" })), getAccessToken: async () => "tok", apiUrl, now: () => 5 });
  assert.equal(await s.refreshSettings({ force: true }), true);
  for (const k of old) assert.equal(chrome.storage.local.data.has(k), false, k);
  assert.ok(chrome.storage.local.data.has("fg_consent")); // consent belongs to the browser, not the account
  assert.equal(chrome.storage.local.data.get("fg_settings_cache").profile.user_id, "u2");
});

test("signed out → no request", async () => {
  const fetch = fakeFetch(() => jsonResponse(200, PROFILE));
  const s = createSettings({ chrome: fakeChrome(), fetch, getAccessToken: async () => null, apiUrl });
  assert.equal(await s.refreshSettings({ force: true }), false);
  assert.equal(fetch.log.length, 0);
});

test("server error or network failure keeps the old cache", async () => {
  const chrome = fakeChrome();
  chrome.storage.local.data.set("fg_settings_cache", { at: 1, profile: PROFILE });
  const s500 = createSettings({ chrome, fetch: fakeFetch(() => jsonResponse(500, {})), getAccessToken: async () => "tok", apiUrl });
  assert.equal(await s500.refreshSettings({ force: true }), false);
  const sNet = createSettings({ chrome, fetch: fakeFetch(() => { throw new TypeError("Failed to fetch"); }), getAccessToken: async () => "tok", apiUrl });
  assert.equal(await sNet.refreshSettings({ force: true }), false);
  assert.deepEqual(chrome.storage.local.data.get("fg_settings_cache"), { at: 1, profile: PROFILE });
});

test("getDeviceId creates one id and reuses it", async () => {
  const s = createSettings({ chrome: fakeChrome() });
  const a = await s.getDeviceId();
  assert.match(a, /^[0-9a-f-]{36}$/);
  assert.equal(await s.getDeviceId(), a);
});
