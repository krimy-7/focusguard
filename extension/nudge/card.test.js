// @ts-check
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderCard, removeCard } from "./card.js";
import { nudgeModel, welcomeModel } from "./model.js";

const copy = JSON.parse(readFileSync(new URL("../copy/en.json", import.meta.url), "utf8"));

/** Tiny DOM: just enough for card.js. */
class El {
  /** @param {string} tag */
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    /** @type {El[]} */ this.children = [];
    /** @type {Record<string,string>} */ this.attrs = {};
    /** @type {Record<string, Function[]>} */ this.listeners = {};
    this.textContent = "";
    this.hidden = false;
    this.value = "";
    this.id = "";
    /** @type {El|null} */ this.parent = null;
    /** @type {El|null} */ this.shadow = null;
    /** @type {string|null} */ this.shadowMode = null;
    this.focusCalls = 0;
  }
  /** @param {string} k @param {string} v */ setAttribute(k, v) { this.attrs[k] = String(v); }
  /** @param {string} k */ getAttribute(k) { return this.attrs[k] ?? null; }
  /** @param {...El} kids */ append(...kids) { for (const k of kids) { k.parent = this; this.children.push(k); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  /** @param {string} t @param {Function} fn */ addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  /** @param {string} t @param {Function} fn */ removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] ?? []).filter((f) => f !== fn); }
  /** @param {string} type @param {Record<string, unknown>} [extra] */
  fire(type, extra = {}) {
    const ev = { type, stopped: false, ...extra, stopPropagation() { ev.stopped = true; }, preventDefault() {} };
    for (const fn of [...(this.listeners[type] ?? [])]) fn(ev);
    return ev;
  }
  /** @param {{mode:string}} init */ attachShadow(init) { this.shadowMode = init.mode; this.shadow = new El("#shadow-root"); return this.shadow; }
  focus() { this.focusCalls++; }
}

/** @param {El} root @param {(e:El)=>boolean} pred @param {El[]} [out] */
function all(root, pred, out = []) {
  for (const c of root.children) {
    if (pred(c)) out.push(c);
    all(c, pred, out);
    if (c.shadow) all(c.shadow, pred, out);
  }
  return out;
}

/** @type {{html:El, win:El, sent:any[]}} */
let dom;
beforeEach(() => {
  const html = new El("html");
  const win = new El("window");
  /** @type {any[]} */ const sent = [];
  const g = /** @type {any} */ (globalThis);
  g.document = { documentElement: html, createElement: (/** @type {string} */ t) => new El(t), getElementById: (/** @type {string} */ id) => html.children.find((c) => c.id === id) ?? null };
  g.window = win;
  g.chrome = { runtime: { sendMessage: (/** @type {any} */ m) => { sent.push(m); return Promise.resolve({ ok: true }); } } };
  dom = { html, win, sent };
});

const host = () => dom.html.children.find((c) => c.id === "focusguard-nudge-host");
const button = (/** @type {string} */ text) => {
  const h = host();
  assert.ok(h?.shadow, "card is rendered");
  const b = all(h.shadow, (e) => e.tagName === "BUTTON" && e.textContent.startsWith(text))[0];
  assert.ok(b, `button "${text}"`);
  return b;
};
const visibleInputs = () => all(/** @type {El} */ (host()?.shadow), (e) => e.tagName === "INPUT" && !(e.parent?.hidden));
const l1 = (/** @type {number[]} */ seen = []) => nudgeModel(
  { level: 1, interventionId: "iv1", copyKey: "nudge_l1", vars: { context: "Thesis", awayMin: 5 } },
  { copy, seenLevels: seen, settingsUrl: "http://dash/settings" },
);

test("function source is self-contained (Chrome serializes it)", () => {
  const render = new Function(`return (${renderCard.toString()})`)();
  render(l1());
  assert.ok(host());
});

test("closed shadow root, dialog role with a name, no overlay, 44px targets", () => {
  renderCard(l1());
  const h = /** @type {El} */ (host());
  assert.equal(h.shadowMode, "closed");
  const dialog = all(/** @type {El} */ (h.shadow), (e) => e.getAttribute("role") === "dialog")[0];
  assert.equal(dialog.getAttribute("aria-label"), copy.ui.card_label);
  const css = all(/** @type {El} */ (h.shadow), (e) => e.tagName === "STYLE")[0].textContent;
  assert.match(css, /min-height:44px/);
  assert.match(css, /position:fixed/);
  assert.match(css, /width:320px/);
  assert.doesNotMatch(css, /inset:0/);
});

test("no focus steal on show", () => {
  renderCard(l1());
  assert.equal(all(dom.html, (e) => e.focusCalls > 0).length, 0);
});

test("first-time explainer with a settings link; none once seen", () => {
  renderCard(l1());
  const link = all(/** @type {El} */ (host()?.shadow), (e) => e.tagName === "A")[0];
  assert.equal(link.getAttribute("href"), "http://dash/settings");
  renderCard(l1([1]));
  assert.equal(all(/** @type {El} */ (host()?.shadow), (e) => e.tagName === "A").length, 0);
});

test("Back sends nudge_action back and removes the card", () => {
  renderCard(l1());
  button(copy.ui.back).fire("click");
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "back" }]);
  assert.equal(host(), undefined);
});

test("This is… → part of {context} sends related", () => {
  renderCard(l1());
  const toggle = button(copy.ui.this_is);
  toggle.fire("click");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  button("Part of Thesis").fire("click");
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "related" }]);
});

test("This is… → a new task → typed title → new_task", () => {
  renderCard(l1());
  button(copy.ui.this_is).fire("click");
  button(copy.ui.new_task).fire("click");
  const [input] = visibleInputs();
  input.value = "  Write report ";
  button(copy.ui.start).fire("click");
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "new_task", title: "Write report" }]);
});

test("+5 min sends extend with n=300", () => {
  renderCard(l1());
  button(copy.ui.extend).fire("click");
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "extend", n: 300 }]);
});

test("Break → optional note → break (Enter submits; empty note omitted)", () => {
  renderCard(l1());
  button(copy.ui.break).fire("click");
  const [note] = visibleInputs();
  note.value = "check 375px breakpoint";
  note.fire("keydown", { key: "Enter" });
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "break", note: "check 375px breakpoint" }]);
  renderCard(l1());
  button(copy.ui.break).fire("click");
  button(copy.ui.start_break).fire("click");
  assert.deepEqual(dom.sent[1], { type: "nudge_action", interventionId: "iv1", action: "break" });
});

test("Esc dismisses and unhooks window listeners", () => {
  renderCard(l1());
  dom.win.fire("keydown", { key: "Escape" });
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "dismiss" }]);
  assert.equal(host(), undefined);
  assert.equal((dom.win.listeners.keydown ?? []).length, 0);
  assert.equal((dom.win.listeners.pagehide ?? []).length, 0);
});

test("keys typed inside the card do not reach page shortcuts", () => {
  renderCard(l1());
  const dialog = all(/** @type {El} */ (host()?.shadow), (e) => e.getAttribute("role") === "dialog")[0];
  for (const t of ["keydown", "keyup", "keypress"]) assert.equal(dialog.fire(t, { key: "k" }).stopped, true, t);
});

test("re-render replaces the card; removeCard clears it", () => {
  renderCard(l1());
  renderCard(l1());
  assert.equal(dom.html.children.length, 1);
  assert.equal((dom.win.listeners.keydown ?? []).length, 1);
  removeCard();
  assert.equal(dom.html.children.length, 0);
  assert.equal((dom.win.listeners.keydown ?? []).length, 0);
});

test("L2 shows the mascot", () => {
  renderCard(nudgeModel({ level: 2, interventionId: "iv2", copyKey: "nudge_l2", vars: { context: "Thesis", awayMin: 10 } }, { copy, seenLevels: [1, 2], settingsUrl: "x" }));
  assert.equal(all(/** @type {El} */ (host()?.shadow), (e) => e.getAttribute("aria-hidden") === "true" && e.textContent === "🦉").length, 1);
});

test("welcome card: note first, Got it closes without messaging", () => {
  renderCard(welcomeModel({ vars: { context: "Thesis", note: "check 375px breakpoint", awayMin: 30 } }, { copy, sites: ["figma.com"] }));
  const paras = all(/** @type {El} */ (host()?.shadow), (e) => e.tagName === "P");
  assert.equal(paras[0].textContent, "Your note: check 375px breakpoint");
  button(copy.ui.got_it).fire("click");
  assert.equal(dom.sent.length, 0);
  assert.equal(host(), undefined);
});
