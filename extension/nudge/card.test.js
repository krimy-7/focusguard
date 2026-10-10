// @ts-check
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderCard, removeCard } from "./card.js";
import { nudgeModel, welcomeModel } from "./model.js";

const copy = JSON.parse(readFileSync(new URL("../copy/en.json", import.meta.url), "utf8"));

/** @type {El[]} */ let focusLog = [];

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
  }
  /** @param {string} k @param {string} v */ setAttribute(k, v) { this.attrs[k] = String(v); }
  /** @param {string} k */ getAttribute(k) { return this.attrs[k] ?? null; }
  /** @param {...El} kids */ append(...kids) { for (const k of kids) { if (k.parent) k.remove(); k.parent = this; this.children.push(k); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  /** @param {string} t @param {Function} fn */ addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  /** @param {string} t @param {Function} fn */ removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] ?? []).filter((f) => f !== fn); }
  /** @param {string} type @param {Record<string, unknown>} [extra] */
  fire(type, extra = {}) {
    const ev = { type, stopped: false, target: this, ...extra, stopPropagation() { ev.stopped = true; }, preventDefault() {} };
    for (const fn of [...(this.listeners[type] ?? [])]) fn(ev);
    return ev;
  }
  /** @param {{mode:string}} init */ attachShadow(init) { this.shadowMode = init.mode; this.shadow = new El("#shadow-root"); return this.shadow; }
  focus() { focusLog.push(this); }
  /** Visible = no hidden ancestor inside the card. */
  get shown() { for (/** @type {El|null} */ let e = this; e; e = e.parent) if (e.hidden) return false; return true; }
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

/** @type {{html:El, win:El, doc:El, sent:any[]}} */
let dom;
beforeEach(() => {
  focusLog = [];
  const html = new El("html");
  const win = new El("window");
  const doc = /** @type {any} */ (new El("document"));
  /** @type {any[]} */ const sent = [];
  doc.documentElement = html;
  doc.fullscreenElement = null;
  doc.createElement = (/** @type {string} */ t) => new El(t);
  doc.createElementNS = (/** @type {string} */ _ns, /** @type {string} */ t) => new El(t);
  doc.getElementById = (/** @type {string} */ id) => all(html, (e) => e.id === id)[0] ?? null;
  const g = /** @type {any} */ (globalThis);
  g.document = doc;
  g.window = win;
  g.chrome = { runtime: { sendMessage: (/** @type {any} */ m) => { sent.push(m); return Promise.resolve({ ok: true }); } } };
  dom = { html, win, doc, sent };
});
afterEach(() => mock.timers.reset());

const host = () => all(dom.html, (e) => e.id === "focusguard-nudge-host")[0];
const root = () => /** @type {El} */ (host()?.shadow);
const byText = (/** @type {string} */ text) => {
  assert.ok(host()?.shadow, "card is rendered");
  const b = all(root(), (e) => e.tagName === "BUTTON" && e.textContent.startsWith(text))[0];
  assert.ok(b, `button "${text}"`);
  return b;
};
const cardEl = () => all(root(), (e) => e.getAttribute("role") === "region")[0];
const css = () => all(root(), (e) => e.tagName === "STYLE")[0].textContent;
const visibleInputs = () => all(root(), (e) => e.tagName === "INPUT" && e.shown);
const visibleBtns = () => all(root(), (e) => e.tagName === "BUTTON" && /\bbtn\b/.test(e.getAttribute("class") ?? "") && e.shown);
const model = (/** @type {1|2} */ level = 1, context = "Thesis") => nudgeModel(
  { level, interventionId: `iv${level}`, copyKey: `nudge_l${level}`, vars: { context, awayMin: 5 } },
  { copy, settingsUrl: "http://dash/settings" },
);
const l1 = () => model(1);

test("function source is self-contained (Chrome serializes it)", () => {
  const render = new Function(`return (${renderCard.toString()})`)();
  render(l1());
  assert.ok(host());
});

test("closed shadow root, named region, no overlay; targets 44px; one type size; fixed 320px corner card", () => {
  renderCard(l1());
  assert.equal(host().shadowMode, "closed");
  assert.equal(cardEl().getAttribute("aria-label"), copy.ui.card_label);
  assert.match(css(), /min-height:44px/);
  assert.match(css(), /position:fixed/);
  assert.match(css(), /width:320px/);
  assert.equal(css().match(/position:fixed/g)?.length, 1); // only the card is fixed; nothing is a page-wide overlay
  assert.doesNotMatch(css(), /font-size/); // rank by weight alone: the single size is the 16px in the font shorthand
  assert.equal([...css().matchAll(/font:\d+ (\d+)px/g)].map((m) => m[1]).join(), "16");
});

test("light and dark tokens, and motion only when the user has no reduced-motion preference", () => {
  renderCard(l1());
  assert.match(css(), /--surface:#F6F7F1/);
  assert.match(css(), /prefers-color-scheme:dark\)\{\.card\{[^}]*--surface:#2B1E17/);
  const firstAnimation = css().indexOf("animation");
  assert.ok(firstAnimation > css().indexOf("prefers-reduced-motion:no-preference"));
  assert.doesNotMatch(css(), /red|#[c-f]00/i); // nothing ever turns red
});

test("no focus steal on show", () => {
  renderCard(l1());
  assert.equal(focusLog.length, 0);
});

test("announced once: the live region exists empty before its text is inserted, and the message itself is not live", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  renderCard(l1());
  const live = all(root(), (e) => e.getAttribute("role") === "status")[0];
  assert.equal(live.getAttribute("aria-live"), "polite");
  assert.equal(live.textContent, "");
  assert.ok(host().parent, "host is in the page when the region is still empty");
  mock.timers.tick(100);
  assert.equal(live.textContent, l1().message);
  assert.equal(all(root(), (e) => e.attrs["aria-live"] !== undefined).length, 1);
});

test("one row: Back (primary), +5 min, Break; a quiet link; the explainer stays behind \"Why this?\"", () => {
  renderCard(l1());
  assert.deepEqual(visibleBtns().map((b) => b.textContent), [copy.ui.back, copy.ui.extend, copy.ui.break]);
  assert.deepEqual(visibleBtns().filter((b) => /primary/.test(b.getAttribute("class") ?? "")).map((b) => b.textContent), [copy.ui.back]);
  assert.equal(byText(copy.ui.this_is).getAttribute("class"), "link");
  const why = all(root(), (e) => e.getAttribute("id") === "fg-why")[0];
  assert.equal(why.hidden, true);
  const toggle = byText(copy.ui.why);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.getAttribute("aria-controls"), "fg-why");
  toggle.fire("click");
  assert.equal(why.hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.match(why.textContent, /Thesis/);
  assert.equal(all(why, (e) => e.tagName === "A")[0].getAttribute("href"), "http://dash/settings");
  toggle.fire("click");
  assert.equal(why.hidden, true);
});

test("Back sends nudge_action back and removes the card", () => {
  renderCard(l1());
  byText(copy.ui.back).fire("click");
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "back" }]);
  assert.equal(host(), undefined);
});

test("\"This is part of my task\" opens the related / new-task choice; Part of this task sends related", () => {
  renderCard(l1());
  const link = byText(copy.ui.this_is);
  link.fire("click");
  assert.equal(link.getAttribute("aria-expanded"), "true");
  assert.deepEqual(visibleBtns().map((b) => b.textContent), [copy.ui.part_of, copy.ui.new_task]);
  byText(copy.ui.part_of).fire("click");
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "related" }]);
});

test("choice → a new task: the title input takes focus; Start sends new_task with the trimmed title", () => {
  renderCard(l1());
  byText(copy.ui.this_is).fire("click");
  byText(copy.ui.new_task).fire("click");
  const [input] = visibleInputs();
  assert.equal(input.getAttribute("placeholder"), copy.ui.new_task_placeholder);
  assert.equal(focusLog.at(-1), input);
  input.value = "  Write report ";
  byText(copy.ui.start).fire("click");
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "new_task", title: "Write report" }]);
});

test("+5 min sends extend with n=300", () => {
  renderCard(l1());
  byText(copy.ui.extend).fire("click");
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "extend", n: 300 }]);
});

test("Break focuses its note input; Enter submits; empty note is omitted; Enter mid-IME-composition does not submit", () => {
  renderCard(l1());
  byText(copy.ui.break).fire("click");
  const [note] = visibleInputs();
  assert.equal(focusLog.at(-1), note);
  note.value = "check 375px breakpoint";
  note.fire("keydown", { key: "Enter", isComposing: true });
  assert.equal(dom.sent.length, 0);
  note.fire("keydown", { key: "Enter" });
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "break", note: "check 375px breakpoint" }]);
  renderCard(l1());
  byText(copy.ui.break).fire("click");
  byText(copy.ui.start_break).fire("click");
  assert.deepEqual(dom.sent[1], { type: "nudge_action", interventionId: "iv1", action: "break" });
});

test("Esc is not captured window-wide: it only acts while focus is inside the card", () => {
  renderCard(l1());
  dom.win.fire("keydown", { key: "Escape" });
  assert.equal(dom.sent.length, 0);
  assert.ok(host());
  assert.equal((dom.win.listeners.keydown ?? []).length, 0);
  cardEl().fire("keydown", { key: "Escape" });
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "dismiss" }]);
  assert.equal(host(), undefined);
});

test("Esc in a panel closes the panel and returns focus; Esc on an input with text never discards it", () => {
  renderCard(l1());
  const brk = byText(copy.ui.break);
  brk.fire("click");
  const [note] = visibleInputs();
  note.value = "check 375px breakpoint";
  cardEl().fire("keydown", { key: "Escape", target: note });
  assert.equal(note.value, "check 375px breakpoint");
  assert.deepEqual(visibleInputs(), [note], "panel still open");
  assert.equal(dom.sent.length, 0);
  note.value = "   ";
  cardEl().fire("keydown", { key: "Escape", target: note }); // nothing worth keeping: Esc steps back
  assert.equal(visibleInputs().length, 0);
  assert.equal(focusLog.at(-1), brk);
  assert.equal(dom.sent.length, 0);
  cardEl().fire("keydown", { key: "Escape", target: brk }); // then a second Esc dismisses
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "dismiss" }]);
});

test("Cancel returns to the one-row actions and puts focus back where the user was", () => {
  renderCard(l1());
  const link = byText(copy.ui.this_is);
  link.fire("click");
  byText(copy.ui.new_task).fire("click");
  byText(copy.ui.cancel).fire("click");
  assert.deepEqual(visibleBtns().map((b) => b.textContent), [copy.ui.back, copy.ui.extend, copy.ui.break]);
  assert.equal(focusLog.at(-1), link);
});

test("the × dismisses and counts as a dismiss", () => {
  renderCard(l1());
  const x = all(root(), (e) => e.getAttribute("aria-label") === copy.ui.dismiss)[0];
  x.fire("click");
  assert.deepEqual(dom.sent, [{ type: "nudge_action", interventionId: "iv1", action: "dismiss" }]);
});

test("keys typed inside the card do not reach page shortcuts", () => {
  renderCard(l1());
  for (const t of ["keydown", "keyup", "keypress"]) assert.equal(cardEl().fire(t, { key: "k" }).stopped, true, t);
});

test("re-render replaces the card; removeCard clears it and every listener", () => {
  renderCard(l1());
  renderCard(l1());
  assert.equal(dom.html.children.length, 1);
  assert.equal((dom.win.listeners.pagehide ?? []).length, 1);
  assert.equal((dom.doc.listeners.fullscreenchange ?? []).length, 1);
  removeCard();
  assert.equal(dom.html.children.length, 0);
  assert.equal((dom.win.listeners.pagehide ?? []).length, 0);
  assert.equal((dom.doc.listeners.fullscreenchange ?? []).length, 0);
});

test("L2 is the same quiet card: same controls, same structure, no mascot or emoji", () => {
  renderCard(model(1));
  const one = all(root(), () => true).map((e) => e.tagName + e.getAttribute("class"));
  renderCard(model(2, "Thesis"));
  const two = all(root(), () => true).map((e) => e.tagName + e.getAttribute("class"));
  assert.deepEqual(two, one);
  assert.deepEqual(visibleBtns().map((b) => b.textContent), [copy.ui.back, copy.ui.extend, copy.ui.break]);
  assert.equal(all(root(), (e) => /\p{Extended_Pictographic}/u.test(e.textContent)).length, 0);
  assert.match(model(2).explainer, /second check-in/);
});

test("fullscreen: the card goes inside the fullscreen element, and follows it in and out", () => {
  const player = new El("div");
  dom.html.append(player);
  dom.doc.fullscreenElement = player;
  renderCard(l1());
  assert.equal(host().parent, player);
  dom.doc.fullscreenElement = null;
  dom.doc.fire("fullscreenchange");
  assert.equal(host().parent, dom.html);
  dom.doc.fullscreenElement = player;
  dom.doc.fire("fullscreenchange");
  assert.equal(host().parent, player);
});

test("welcome card: note first, Got it closes without messaging, Esc closes it too", () => {
  const w = welcomeModel({ vars: { context: "Thesis", note: "check 375px breakpoint", awayMin: 30 } }, { copy, sites: ["figma.com"] });
  renderCard(w);
  const paras = all(root(), (e) => e.tagName === "P");
  assert.equal(paras[0].textContent, "Your note: check 375px breakpoint");
  byText(copy.ui.got_it).fire("click");
  assert.equal(dom.sent.length, 0);
  assert.equal(host(), undefined);
  renderCard(w);
  cardEl().fire("keydown", { key: "Escape" });
  assert.equal(dom.sent.length, 0);
  assert.equal(host(), undefined);
});
