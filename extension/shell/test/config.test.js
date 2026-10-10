// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG, getConfig, loadLocalConfigIntoStorage } from "../../config.js";

/** Minimal storage.local stand-in (fake-chrome.js arrives in Task 5). */
function memStore() {
  /** @type {Map<string, any>} */
  const data = new Map();
  return {
    data,
    /** @param {string} k */
    async get(k) { return data.has(k) ? { [k]: structuredClone(data.get(k)) } : {}; },
    /** @param {Record<string, any>} o */
    async set(o) { for (const [k, v] of Object.entries(o)) data.set(k, structuredClone(v)); },
    /** @param {string} k */
    async remove(k) { data.delete(k); },
  };
}

const getURL = (/** @type {string} */ p) => `chrome-extension://x/${p}`;

test("no override → defaults plus ENGINE {}", async () => {
  const store = memStore();
  assert.deepEqual(await getConfig(store), {
    API_URL: "http://localhost:8000", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", DASHBOARD_URL: "http://localhost:8081", ENGINE: {},
  });
});

test("config.local.json is stored in fg_config_override and merged by getConfig", async () => {
  const store = memStore();
  /** @type {string[]} */
  const asked = [];
  await loadLocalConfigIntoStorage(
    async (url) => { asked.push(url); return { ok: true, json: async () => ({ API_URL: "https://api.example", ENGINE: { GRACE_DEFAULT_S: 60 } }) }; },
    getURL,
    store,
  );
  assert.deepEqual(asked, ["chrome-extension://x/config.local.json"]);
  assert.deepEqual(store.data.get("fg_config_override"), { API_URL: "https://api.example", ENGINE: { GRACE_DEFAULT_S: 60 } });
  const cfg = await getConfig(store);
  assert.equal(cfg.API_URL, "https://api.example");
  assert.equal(cfg.DASHBOARD_URL, "http://localhost:8081");
  assert.deepEqual(cfg.ENGINE, { GRACE_DEFAULT_S: 60 });
});

test("missing config.local.json clears a stale override; defaults stand", async () => {
  const store = memStore();
  store.data.set("fg_config_override", { API_URL: "https://stale" });
  await loadLocalConfigIntoStorage(async () => { throw new TypeError("Failed to fetch"); }, getURL, store);
  assert.equal(store.data.has("fg_config_override"), false);
  assert.equal((await getConfig(store)).API_URL, "http://localhost:8000");
});

test("CONFIG is frozen and never mutated", () => {
  assert.ok(Object.isFrozen(CONFIG));
  assert.equal(CONFIG.API_URL, "http://localhost:8000");
  assert.equal("ENGINE" in CONFIG, false);
});
