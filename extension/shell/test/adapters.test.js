// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { tabToInput, hostMatches, alarmName, alarmToInput, shouldLand } from "../adapters.js";

const now = 1_700_000_000_000;
const blind = (/** @type {number} */ tabId) => ({ type: "landing", tabId, host: null, title: "", ts: now });

test("normal tab → host without www, sanitized title", () => {
  assert.deepEqual(
    tabToInput({ id: 1, url: "https://www.figma.com/file/x", title: "Landing v3 – Figma 123456" }, { now }),
    { type: "landing", tabId: 1, host: "figma.com", title: "Landing v3 – Figma", ts: now },
  );
});

test("host is A's normalizeHost only; seed keying stays in the engine (R20)", () => {
  assert.equal(tabToInput({ id: 2, url: "https://old.reddit.com/r/x", title: "r/x" }, { now }).host, "old.reddit.com");
  assert.equal(tabToInput({ id: 3, url: "https://news.ycombinator.com./", title: "HN" }, { now }).host, "news.ycombinator.com");
});

test("blind: no tab, incognito, non-web schemes, bad URL", () => {
  assert.deepEqual(tabToInput(null, { now }), blind(-1));
  assert.deepEqual(tabToInput({ id: 4, url: "https://reddit.com", title: "x", incognito: true }, { now }), blind(4));
  for (const url of ["chrome://newtab/", "chrome-extension://abc/popup.html", "file:///C:/a.pdf", "about:blank", "data:text/html,hi", "not a url", ""])
    assert.deepEqual(tabToInput({ id: 5, url, title: "secret" }, { now }), blind(5), url);
});

test("blind: built-in sensitive hosts never carry host or title", () => {
  const out = tabToInput({ id: 6, url: "https://online.chase.com/acct", title: "Account 1234567 – Chase" }, { now });
  assert.deepEqual(out, blind(6));
  assert.ok(!JSON.stringify(out).includes("chase"));
});

test("blind: user extra-sensitive list matches the host and its subdomains, case-insensitively", () => {
  const extraSensitive = ["MyCorp.internal", "therapy.example"];
  assert.deepEqual(tabToInput({ id: 7, url: "https://hr.mycorp.internal/me", title: "Payslip" }, { now, extraSensitive }), blind(7));
  assert.deepEqual(tabToInput({ id: 8, url: "https://therapy.example/", title: "Session" }, { now, extraSensitive }), blind(8));
  assert.equal(tabToInput({ id: 9, url: "https://notmycorp.internal/", title: "ok" }, { now, extraSensitive }).host, "notmycorp.internal");
});

test("blind: a trailing-dot FQDN cannot slip past the sensitive checks", () => {
  assert.deepEqual(tabToInput({ id: 10, url: "https://online.chase.com./acct", title: "x" }, { now }), blind(10));
  assert.deepEqual(tabToInput({ id: 11, url: "https://irs.gov./", title: "x" }, { now }), blind(11));
  assert.deepEqual(tabToInput({ id: 12, url: "https://hr.mycorp.internal./me", title: "x" }, { now, extraSensitive: ["MyCorp.internal."] }), blind(12));
});

test("hostMatches is exact-or-subdomain", () => {
  assert.ok(hostMatches("a.b.com", "b.com"));
  assert.ok(hostMatches("b.com", "b.com"));
  assert.ok(!hostMatches("ab.com", "b.com"));
});

test("late alarm keeps its original dueAt (Chrome clamps/delays scheduledTime)", () => {
  const at = 1_700_000_300_000;
  assert.equal(alarmName("grace", at), `grace@${at}`);
  assert.deepEqual(alarmToInput({ name: `grace@${at}`, scheduledTime: at + 4_000_000 }), { type: "alarm", kind: "grace", dueAt: at });
  assert.deepEqual(alarmToInput({ name: `escalate@${at}`, scheduledTime: at }), { type: "alarm", kind: "escalate", dueAt: at });
});

test("heartbeat alarms become heartbeat ticks; non-engine alarms are not engine inputs", () => {
  assert.deepEqual(alarmToInput({ name: "heartbeat", scheduledTime: 0 }), { type: "heartbeat", reason: "tick" });
  assert.deepEqual(alarmToInput({ name: "heartbeat@123", scheduledTime: 0 }), { type: "heartbeat", reason: "tick" });
  assert.equal(alarmToInput({ name: "beast:end", scheduledTime: 0 }), null); // routed to Beast Mode by background.js (R13)
  assert.equal(alarmToInput({ name: "fg_sync", scheduledTime: 0 }), null);
  assert.equal(alarmToInput({ name: "grace@soon", scheduledTime: 0 }), null);
});

test("shouldLand: active + complete + focused window only", () => {
  const tab = { active: true, windowId: 1 };
  assert.equal(shouldLand({ status: "complete" }, tab, { id: 1, focused: true }), true);
  assert.equal(shouldLand({ status: "loading" }, tab, { id: 1, focused: true }), false);
  assert.equal(shouldLand({ status: "complete" }, { active: false, windowId: 1 }, { id: 1, focused: true }), false);
  assert.equal(shouldLand({ status: "complete" }, tab, { id: 2, focused: true }), false);
  assert.equal(shouldLand({ status: "complete" }, tab, { id: 1, focused: false }), false);
});
