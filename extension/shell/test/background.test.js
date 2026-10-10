// @ts-check
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fakeChrome, callsOf } from "./fake-chrome.js";

const chrome = fakeChrome();
const realError = console.error;
before(async () => {
  /** @type {any} */ (globalThis).chrome = chrome;
  // Loading domains.json via chrome-extension:// fails in node, so background.js logs "failed to start" once `ready`
  // rejects (after the import returns). That is fine here; keep it quiet for the whole file.
  console.error = () => {};
  await import("../../background.js");
});
after(() => {
  console.error = realError;
});

test("every listener is registered synchronously on import", () => {
  assert.deepEqual(Object.keys(chrome.listeners).sort(), [
    "alarms.onAlarm", "idle.onStateChanged", "notifications.onButtonClicked", "notifications.onClicked",
    "runtime.onInstalled", "runtime.onMessage", "runtime.onStartup",
    "tabGroups.onRemoved", "tabs.onActivated", "tabs.onRemoved", "tabs.onUpdated", "windows.onFocusChanged",
  ]);
  assert.deepEqual(callsOf(chrome, "idle.setDetectionInterval"), [["idle.setDetectionInterval", 600]]);
});

test("beast:* alarms go straight to Beast Mode (R13), never to the engine", async () => {
  chrome.listeners["alarms.onAlarm"]({ name: "beast:bypass:9500", scheduledTime: 0 });
  await new Promise((r) => setTimeout(r, 20));
  // Runs even though `ready` cannot finish in node (no chrome-extension:// fetch), so it is not gated on the engine.
  assert.deepEqual(callsOf(chrome, "dnr.updateSessionRules"), [["dnr.updateSessionRules", { removeRuleIds: [9500] }]]);
  assert.equal(chrome.storage.local.data.has("fg_engine"), false);
});
