// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMessageHandler, nudgeActionToInput, notificationToInput } from "../messages.js";

const POPUP = { id: "ext", url: "chrome-extension://ext/popup/popup.html" };
const PAGE = { id: "ext", url: "https://www.reddit.com/r/x", tab: { id: 3 } }; // our own content: injected card

/** @param {Record<string, any>} [over] */
function setup(over = {}) {
  const log = { dispatched: /** @type {any[]} */ ([]), refreshed: /** @type {any[]} */ ([]), flushed: 0 };
  const handle = createMessageHandler({
    dispatch: async (i) => { log.dispatched.push(i); return { state: { phase: "active" }, effects: [] }; },
    getState: async () => ({ phase: "idle" }),
    view: (s, now) => ({ phase: s.phase, at: now }),
    now: () => 42,
    refreshSettings: async (o) => { log.refreshed.push(o); return true; },
    flush: async () => { log.flushed++; },
    isSignedIn: async () => true,
    getDeviceId: async () => "dev-1",
    getRules: async () => [],
    extensionId: "ext",
    ...over,
  });
  return { handle, log };
}

test("cmd from the popup dispatches and returns the view", async () => {
  const { handle, log } = setup();
  assert.deepEqual(await handle({ type: "cmd", cmd: "pause", until: 99 }, POPUP), { ok: true, view: { phase: "active", at: 42 } });
  assert.deepEqual(log.dispatched, [{ type: "cmd", cmd: "pause", until: 99 }]);
});

test("cmd from a tab (injected card, extension page in a tab) or another extension is refused (R29)", async () => {
  const { handle, log } = setup();
  assert.deepEqual(await handle({ type: "cmd", cmd: "end" }, PAGE), { ok: false, error: "forbidden" });
  assert.deepEqual(await handle({ type: "cmd", cmd: "end" }, { id: "ext", url: "chrome-extension://ext/blocked.html", tab: { id: 4 } }), { ok: false, error: "forbidden" });
  assert.deepEqual(await handle({ type: "cmd", cmd: "end" }, { id: "other", url: "chrome-extension://other/popup.html" }), { ok: false, error: "forbidden" });
  assert.equal(log.dispatched.length, 0);
});

test("cmd before consent", async () => {
  const { handle } = setup({ dispatch: async () => null });
  assert.deepEqual(await handle({ type: "cmd", cmd: "confirm" }, POPUP), { ok: false, error: "no_consent" });
});

test("get_view returns view, sign-in state and device id; refreshes stale settings", async () => {
  const { handle, log } = setup();
  assert.deepEqual(await handle({ type: "get_view" }, POPUP), { view: { phase: "idle", at: 42 }, signedIn: true, deviceId: "dev-1" });
  assert.deepEqual(log.refreshed, [{ maxAgeMs: 60_000 }]);
});

test("settings_changed forces a refresh and a flush", async () => {
  const { handle, log } = setup();
  assert.deepEqual(await handle({ type: "settings_changed" }, POPUP), { ok: true });
  assert.deepEqual(log.refreshed, [{ force: true }]);
  assert.equal(log.flushed, 1);
  assert.equal(log.dispatched.length, 0);
});

test("settings_changed: a related rule deleted in the popup leaves the live context (R14)", async () => {
  const ctx = { id: "c1", relatedHosts: ["youtube.com", "figma.com"] };
  const { handle, log } = setup({
    getState: async () => ({ phase: "active", ctx }),
    getRules: async () => [{ host: "figma.com", contextId: "c1", contextTitle: "T", at: 1 }, { host: "youtube.com", contextId: "c9", contextTitle: "T", at: 1 }],
  });
  await handle({ type: "settings_changed" }, POPUP);
  // No id: a deterministic id would sit in the engine's 20-id ring and silently drop the next
  // delete of the same host after the user re-relates it (delete → re-relate → delete).
  assert.deepEqual(log.dispatched, [{ type: "cmd", cmd: "unrelate", host: "youtube.com" }]);
  await handle({ type: "settings_changed" }, POPUP); // second delete of the same host
  assert.deepEqual(log.dispatched[1], { type: "cmd", cmd: "unrelate", host: "youtube.com" });
  assert.ok(log.dispatched.every((i) => !("id" in i)));
});

test("nudge_action from the card maps to engine cmds", async () => {
  const { handle, log } = setup();
  for (const [msg, input] of [
    [{ action: "back" }, { cmd: "back" }],
    [{ action: "related" }, { cmd: "related" }],
    [{ action: "new_task", title: "Write report" }, { cmd: "new_task", title: "Write report" }],
    [{ action: "new_task" }, { cmd: "new_task" }],
    [{ action: "extend", n: 300 }, { cmd: "extend", n: 300 }],
    [{ action: "break", note: "check 375px" }, { cmd: "break", note: "check 375px" }],
    [{ action: "dismiss" }, { cmd: "dismiss" }],
  ]) {
    log.dispatched.length = 0;
    assert.deepEqual(await handle({ type: "nudge_action", interventionId: "iv1", ...msg }, PAGE), { ok: true });
    assert.deepEqual(log.dispatched, [{ type: "cmd", id: `iv1:${msg.action}`, ...input }]);
  }
});

test("unknown card actions and malformed messages are ignored", async () => {
  const { handle, log } = setup();
  assert.deepEqual(await handle({ type: "nudge_action", interventionId: "iv1", action: "end" }, PAGE), { ok: true });
  assert.deepEqual(await handle({ type: "nudge_action", action: "back" }, PAGE), { ok: true });
  assert.equal(log.dispatched.length, 0);
  assert.deepEqual(await handle({ type: "LOG_EVENT" }, PAGE), { ok: false, error: "unknown_message" });
  assert.deepEqual(await handle(undefined, PAGE), { ok: false, error: "unknown_message" });
});

test("same action twice (double click, or card + notification) → same id, so the engine dedupes", () => {
  assert.deepEqual(nudgeActionToInput({ interventionId: "iv1", action: "back" }), nudgeActionToInput({ interventionId: "iv1", action: "back" }));
  assert.deepEqual(notificationToInput("nudge:iv1", 0), nudgeActionToInput({ interventionId: "iv1", action: "back" }));
});

test("inputs are trimmed to safe sizes", () => {
  assert.equal(nudgeActionToInput({ interventionId: "i", action: "new_task", title: "x".repeat(500) })?.title?.length, 120);
  assert.equal(nudgeActionToInput({ interventionId: "i", action: "break", note: "y".repeat(500) })?.note?.length, 280);
  assert.equal(nudgeActionToInput({ interventionId: "i", action: "extend" })?.n, 300);
});

test("notification buttons", () => {
  assert.deepEqual(notificationToInput("nudge:iv_7", 1), { type: "cmd", id: "iv_7:extend", cmd: "extend", n: 300 });
  assert.deepEqual(notificationToInput("propose", 0), { type: "cmd", cmd: "confirm" });
  assert.deepEqual(notificationToInput("propose", 1), { type: "cmd", cmd: "cancel" });
  assert.equal(notificationToInput("welcome", 0), null);
  assert.equal(notificationToInput("nudge:iv_7", 5), null);
});
