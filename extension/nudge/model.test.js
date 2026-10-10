// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nudgeModel, welcomeModel, EXTEND_S } from "./model.js";
import { fill, hasBanned } from "../copy/copy.js";

const copy = JSON.parse(readFileSync(new URL("../copy/en.json", import.meta.url), "utf8"));
const fx = (/** @type {1|2} */ level, id = "iv_1", copyKey = `nudge_l${level}`) => ({
  type: "show_nudge", level, interventionId: id, copyKey, vars: { context: "Thesis draft", awayMin: 6 }, actions: [], extendOptionsS: [120, 300, 600],
});
const opts = () => ({ copy, settingsUrl: "http://dash/settings" });

test("L1 carries the explainer and the settings link", () => {
  const m = nudgeModel(fx(1), opts());
  assert.equal(m.kind, "nudge");
  assert.equal(m.level, 1);
  assert.equal("mascot" in m, false);
  assert.match(m.message, /Thesis draft/);
  assert.match(String(m.explainer), /Thesis draft/);
  assert.equal(m.settingsUrl, "http://dash/settings");
  assert.equal(m.ui.part_of, "Part of this task");
  assert.equal(m.extendS, EXTEND_S);
  assert.equal(EXTEND_S, 300);
});

test("the explainer is always there for the card's \"Why this?\" and says what dismissing does", () => {
  for (const level of /** @type {(1|2)[]} */ ([1, 2])) {
    const e = String(nudgeModel(fx(level), opts()).explainer);
    assert.match(e, /dismiss/i);
    assert.match(e, /detour/i);
  }
});

test("L2 is the same quiet card with its own wording: no mascot, nothing extra", () => {
  const m1 = nudgeModel(fx(1), opts());
  const m2 = nudgeModel(fx(2), opts());
  assert.deepEqual(Object.keys(m2), Object.keys(m1));
  assert.equal("mascot" in m2, false);
  assert.ok(copy.nudge_l2.map((/** @type {string} */ t) => fill(t, { context: "Thesis draft" })).includes(m2.message));
});

test("a long task name is cut to fit two lines, on a whole grapheme, with an ellipsis", () => {
  const f = fx(1);
  f.vars.context = "Write the methodology chapter of my thesis draft before Friday's meeting";
  const m = nudgeModel(f, opts());
  assert.equal(m.context, "Write the methodology…");
  assert.equal([...new Intl.Segmenter().segment(m.context)].length, 22);
  f.vars.context = "विश्वविद्यालयको अनुसन्धान प्रस्ताव लेख्ने काम आजै सक्नुपर्छ र त्यसपछि बैठकको तयारी गर्ने";
  const d = nudgeModel(f, opts()).context;
  const n = [...new Intl.Segmenter().segment(d)].length;
  assert.ok(d.endsWith("…") && n <= 22 && n > 18, d); // cut at a grapheme boundary (a trailing space is trimmed before the ellipsis)
  f.vars.context = "Thesis draft";
  assert.equal(nudgeModel(f, opts()).context, "Thesis draft");
});

test("same intervention → same line; contract key nudge_l1 is used; unknown copyKey falls back to the level bank", () => {
  assert.equal(nudgeModel(fx(1, "iv_9"), opts()).message, nudgeModel(fx(1, "iv_9"), opts()).message);
  assert.ok(copy.nudge_l1.map((/** @type {string} */ t) => fill(t, { context: "Thesis draft" })).includes(nudgeModel(fx(1, "iv_3", "nudge_l1"), opts()).message));
  const m = nudgeModel(fx(1, "iv_2", "l1_mystery"), opts());
  assert.ok(copy.nudge_l1.map((/** @type {string} */ t) => fill(t, { context: "Thesis draft" })).includes(m.message));
});

test("missing context name reads naturally", () => {
  const f = fx(1);
  f.vars.context = "";
  assert.match(nudgeModel(f, opts()).message, /your task/);
});

test("welcome back: the user's note first, at most 3 site names", () => {
  const m = welcomeModel(
    { type: "show_recovery", copyKey: "welcome_back", vars: { context: "Thesis", note: "check 375px breakpoint", awayMin: 30 } },
    { copy, sites: ["figma.com", "pinterest.com", "github.com", "x.com"] },
  );
  assert.equal(m.kind, "welcome");
  assert.equal(m.note, "Your note: check 375px breakpoint");
  assert.match(m.message, /Thesis/);
  assert.equal(m.sites, "You were on figma.com, pinterest.com, github.com");
});

test("welcome back without note or sites", () => {
  const m = welcomeModel({ type: "show_recovery", copyKey: "welcome_back", vars: { context: "Thesis", note: null, awayMin: 1 } }, { copy, sites: [] });
  assert.equal(m.note, null);
  assert.equal(m.sites, null);
});

test("no model text contains a banned word", () => {
  for (const id of ["a", "b", "c", "d", "e", "f"])
    for (const level of /** @type {(1|2)[]} */ ([1, 2])) {
      const m = nudgeModel(fx(level, id), opts());
      for (const s of [m.message, m.explainer, ...Object.values(m.ui)]) assert.equal(hasBanned(s), false, s);
    }
});
