// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BANNED, hasBanned, fill, pick } from "./copy.js";

const copy = JSON.parse(readFileSync(new URL("./en.json", import.meta.url), "utf8"));

/** @param {unknown} v @param {string[]} [out] @returns {string[]} */
function allStrings(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (v && typeof v === "object") for (const x of Object.values(v)) allStrings(x, out);
  return out;
}

test("banned list is exactly SPEC §10.3", () => {
  assert.deepEqual(BANNED, ["lazy", "failed", "wasted", "distracted again", "you should have", "disappointing"]);
});

test("no user-facing string contains a banned word", () => {
  for (const s of allStrings(copy)) assert.equal(hasBanned(s), false, s);
});

test("hasBanned is case-insensitive", () => {
  assert.equal(hasBanned("You FAILED"), true);
  assert.equal(hasBanned("Your project is waiting for you."), false);
});

test("templates only use known placeholders", () => {
  const allowed = new Set(["context", "note", "sites", "title"]);
  for (const s of allStrings(copy)) for (const [, name] of s.matchAll(/\{(\w+)\}/g)) assert.ok(allowed.has(name), `${name} in "${s}"`);
});

test("banks are non-empty and every nudge line names the context", () => {
  for (const k of ["nudge_l1", "nudge_l2", "welcome_back"]) assert.ok(copy[k].length > 0, k);
  for (const s of [...copy.nudge_l1, ...copy.nudge_l2]) assert.match(s, /\{context\}/);
});

// PRODUCT.md Brand Commitments: never personify the task as hurt or abandoned, never guilt, no mascot-speak, no emoji.
// Test-only (BANNED stays exactly SPEC §10.3); patterns, so "waiting for you" is caught however it is inflected.
const PERSONIFYING = [
  /\bcry(ing|ies)?\b/i, /waiting (for|on) you/i, /abandon/i, /lonel/i, /\bsad\b/i, /\bhurt/i, /\bmiss(es|ing)? you/i,
  /(didn'?t|won'?t) finish itself/i, /\bbro\b/i, /\bguilt/i, /\bshame/i, /\bneglect/i, /\bleft behind\b/i,
];
const EMOJI = /\p{Extended_Pictographic}|️/u;
/** @param {string} s */
const guilty = (s) => PERSONIFYING.some((re) => re.test(s)) || EMOJI.test(s);

test("no string personifies the task, guilt-trips or uses emoji", () => {
  for (const s of allStrings(copy)) assert.equal(guilty(s), false, s);
});

test("the guilt/personifying check has teeth: it catches the retired L2 lines", () => {
  for (const old of ["Your {context} is crying in the corner \u{1F62D}", "Bro, {context} is still waiting for you.", "Plot twist: {context} didn't finish itself.", "{context} feels abandoned", "{context} is lonely", "\u{1F989}"]) assert.equal(guilty(old), true, old);
  assert.equal(guilty("Still here? Want to head back to {context}, or take five?"), false);
});

test("escalation is quieter, not louder: no nudge line shouts", () => {
  for (const s of [...copy.nudge_l1, ...copy.nudge_l2, ...Object.values(copy.explainer)]) {
    assert.doesNotMatch(s, /!/, s);
    assert.notEqual(s, s.toUpperCase(), s);
  }
});

test("fill replaces placeholders and blanks unknown ones", () => {
  assert.equal(fill("Back to {context}{x}", { context: "Thesis" }), "Back to Thesis");
});

test("pick is deterministic per seed and stays in range", () => {
  const list = ["a", "b", "c"];
  assert.equal(pick(list, "iv_1"), pick(list, "iv_1"));
  for (const seed of ["", "x", "iv_600000_3", "🦉"]) assert.ok(list.includes(pick(list, seed)));
});
