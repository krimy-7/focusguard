// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSurfaces, NUDGE_BUTTONS, PROPOSE_BUTTONS } from "../surfaces.js";
import { renderCard, removeCard } from "../../nudge/card.js";
import { fakeChrome, callsOf } from "./fake-chrome.js";

const copy = JSON.parse(readFileSync(new URL("../../copy/en.json", import.meta.url), "utf8"));
const NUDGE = { type: "show_nudge", level: 1, interventionId: "iv_1", copyKey: "nudge_l1", vars: { context: "Thesis", awayMin: 5 }, actions: [], extendOptionsS: [120, 300, 600] };

/** @param {{hostAccess?:boolean, injectFails?:boolean}} [opts] */
function setup(opts = {}) {
  const chrome = fakeChrome(opts);
  const tab = chrome.tabs.add({ url: "https://www.reddit.com/r/x", active: true });
  const s = createSurfaces({ chrome, copy, settingsUrl: () => "http://dash/settings", log: () => {} });
  const state = {
    phase: "intervened_l1", current: { tabId: tab.id, host: "reddit.com" },
    ctx: { id: "c1", title: "Thesis", resources: [{ host: "a.com", lastSeen: 1 }, { host: "b.com", lastSeen: 4 }, { host: "c.com", lastSeen: 3 }, { host: "d.com", lastSeen: 2 }] },
  };
  return { chrome, s, tab, ctx: { prev: state, state, now: 1 } };
}

test("button maps are fixed", () => {
  assert.deepEqual(NUDGE_BUTTONS, ["back", "extend"]);
  assert.deepEqual(PROPOSE_BUTTONS, ["confirm", "cancel"]);
});

test("host access → card injected into the drift tab, no notification", async () => {
  const { chrome, s, tab, ctx } = setup({ hostAccess: true });
  await s.handlers.show_nudge(NUDGE, ctx);
  assert.deepEqual(callsOf(chrome, "permissions.contains")[0][1], { origins: ["https://www.reddit.com/*"] });
  const [, inj] = callsOf(chrome, "scripting.executeScript")[0];
  assert.equal(inj.func, renderCard);
  assert.deepEqual(inj.target, { tabId: tab.id });
  assert.equal(inj.args[0].kind, "nudge");
  assert.equal(inj.args[0].interventionId, "iv_1");
  assert.equal(callsOf(chrome, "notifications.create").length, 0);
  assert.deepEqual(chrome.storage.session.data.get("fg_nudge"), { tabId: tab.id, interventionId: "iv_1" });
});

test("no host access → notification with ≤2 buttons", async () => {
  const { chrome, s, ctx } = setup({ hostAccess: false });
  await s.handlers.show_nudge(NUDGE, ctx);
  assert.equal(callsOf(chrome, "scripting.executeScript").length, 0);
  const [, id, opts] = callsOf(chrome, "notifications.create")[0];
  assert.equal(id, "nudge:iv_1");
  assert.deepEqual(opts.buttons, [{ title: copy.notif.back }, { title: copy.notif.extend }]);
  assert.match(opts.message, /Thesis/);
  assert.deepEqual(chrome.storage.session.data.get("fg_nudge"), { tabId: null, interventionId: "iv_1" });
});

test("injection throws (chrome://, Web Store, PDF) → notification fallback", async () => {
  const { chrome, s, ctx } = setup({ hostAccess: true, injectFails: true });
  await s.handlers.show_nudge(NUDGE, ctx);
  assert.equal(callsOf(chrome, "notifications.create").length, 1);
});

test("drift tab already closed → notification fallback", async () => {
  const { chrome, s, ctx } = setup({ hostAccess: true });
  ctx.state.current.tabId = 9999;
  await s.handlers.show_nudge(NUDGE, ctx);
  assert.equal(callsOf(chrome, "scripting.executeScript").length, 0);
  assert.equal(callsOf(chrome, "notifications.create").length, 1);
});

test("explainer appears only the first time each level is shown", async () => {
  const { chrome, s, ctx } = setup({ hostAccess: true });
  await s.handlers.show_nudge(NUDGE, ctx);
  await s.handlers.show_nudge({ ...NUDGE, interventionId: "iv_2" }, ctx);
  await s.handlers.show_nudge({ ...NUDGE, level: 2, copyKey: "nudge_l2", interventionId: "iv_3" }, ctx);
  const models = callsOf(chrome, "scripting.executeScript").filter((c) => c[1].func === renderCard).map((c) => c[1].args[0]);
  assert.notEqual(models[0].explainer, null);
  assert.equal(models[1].explainer, null);
  assert.notEqual(models[2].explainer, null);
  assert.deepEqual(chrome.storage.local.data.get("fg_seen_explainer"), [1, 2]);
});

test("hide_nudge removes the card in its tab and clears the notification", async () => {
  const { chrome, s, tab, ctx } = setup({ hostAccess: true });
  await s.handlers.show_nudge(NUDGE, ctx);
  await s.handlers.hide_nudge({ type: "hide_nudge" }, ctx);
  const removal = callsOf(chrome, "scripting.executeScript").find((c) => c[1].func === removeCard);
  assert.deepEqual(removal?.[1].target, { tabId: tab.id });
  assert.ok(callsOf(chrome, "notifications.clear").some((c) => c[1] === "nudge:iv_1"));
  assert.equal(chrome.storage.session.data.has("fg_nudge"), false);
});

test("hide_nudge with nothing shown does nothing", async () => {
  const { chrome, s, ctx } = setup();
  await s.handlers.hide_nudge({ type: "hide_nudge" }, ctx);
  assert.equal(chrome.calls.length, 0);
});

test("L2 replaces L1 (L1 is hidden first)", async () => {
  const { chrome, s, ctx } = setup({ hostAccess: false });
  await s.handlers.show_nudge(NUDGE, ctx);
  await s.handlers.show_nudge({ ...NUDGE, level: 2, copyKey: "nudge_l2", interventionId: "iv_2" }, ctx);
  assert.ok(callsOf(chrome, "notifications.clear").some((c) => c[1] === "nudge:iv_1"));
  assert.deepEqual(chrome.storage.session.data.get("fg_nudge"), { tabId: null, interventionId: "iv_2" });
});

test("show_recovery: card on the active tab with the note first and the 3 most recent sites", async () => {
  const { chrome, s, ctx } = setup({ hostAccess: true });
  await s.handlers.show_recovery({ type: "show_recovery", copyKey: "welcome_back", vars: { context: "Thesis", note: "check 375px", awayMin: 40 } }, ctx);
  const model = callsOf(chrome, "scripting.executeScript")[0][1].args[0];
  assert.equal(model.kind, "welcome");
  assert.equal(model.note, "Your note: check 375px");
  assert.equal(model.sites, "You were on b.com, c.com, d.com");
});

test("show_recovery without host access → notification led by the note", async () => {
  const { chrome, s, ctx } = setup({ hostAccess: false });
  await s.handlers.show_recovery({ type: "show_recovery", copyKey: "welcome_back", vars: { context: "Thesis", note: "check 375px", awayMin: 40 } }, ctx);
  const [, id, opts] = callsOf(chrome, "notifications.create")[0];
  assert.equal(id, "welcome");
  assert.ok(opts.message.startsWith("Your note: check 375px"));
});

test("propose_context → badge + 2-button notification; leaving detected clears both", async () => {
  const { chrome, s } = setup();
  await s.handlers.propose_context({ type: "propose_context", host: "github.com", title: "repo", suggested: { title: "Programming", mode: "work" } }, /** @type {any} */ ({}));
  assert.deepEqual(callsOf(chrome, "action.setBadgeText")[0][1], { text: "?" });
  const [, id, opts] = callsOf(chrome, "notifications.create")[0];
  assert.equal(id, "propose");
  assert.equal(opts.title, "Working on Programming?");
  assert.equal(opts.buttons.length, 2);
  await s.afterStep({ prev: { phase: "detected" }, state: { phase: "active" }, now: 2 });
  assert.deepEqual(callsOf(chrome, "action.setBadgeText")[1][1], { text: "" });
  assert.ok(callsOf(chrome, "notifications.clear").some((c) => c[1] === "propose"));
});

test("show_progress opens the popup", async () => {
  const { chrome, s, ctx } = setup();
  await s.handlers.show_progress({ type: "show_progress", contextId: "c1" }, ctx);
  assert.equal(callsOf(chrome, "action.openPopup").length, 1);
});
