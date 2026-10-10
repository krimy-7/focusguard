// @ts-check
// Pure: engine effect → plain JSON for renderCard (executeScript args must be serializable).
import { fill, pick } from "../copy/copy.js";

/** "+5 min" on the card and the notification. */
export const EXTEND_S = 300;
/** The card holds two lines of message (≤140px); a longer task name is cut (on a grapheme, so Devanagari stays whole). */
const NAME_MAX = 22;

/** @param {Record<string,string>} ui @param {Record<string, unknown>} vars */
const fillAll = (ui, vars) => Object.fromEntries(Object.entries(ui).map(([k, v]) => [k, fill(v, vars)]));

/** @param {string} s */
function shorten(s) {
  const g = [...new Intl.Segmenter().segment(s)];
  return g.length <= NAME_MAX ? s : `${g.slice(0, NAME_MAX - 1).map((x) => x.segment).join("").trimEnd()}…`;
}

/**
 * Level 2 is the same quiet card as level 1 with its own wording: no mascot, no extra weight (PRODUCT.md: escalation gets quieter).
 * @param {{level:1|2, interventionId:string, copyKey:string, vars:{context:string, awayMin:number}}} fx
 * @param {{copy:any, settingsUrl:string}} opts
 */
export function nudgeModel(fx, { copy, settingsUrl }) {
  const vars = { context: shorten(fx.vars.context || "your task") };
  /** @type {string[]} */
  const lines = copy[fx.copyKey] ?? copy[`nudge_l${fx.level}`]; // R36 keys: nudge_l1 / nudge_l2
  return {
    kind: /** @type {const} */ ("nudge"),
    level: fx.level,
    interventionId: fx.interventionId,
    label: copy.ui.card_label,
    message: fill(pick(lines, fx.interventionId), vars),
    explainer: fill(copy.explainer[String(fx.level)], vars), // always present: the card keeps it behind "Why this?"
    settingsUrl,
    context: vars.context,
    ui: fillAll(copy.ui, vars),
    extendS: EXTEND_S,
  };
}

/**
 * show_recovery → welcome-back card; the user's own note comes first (spec §4.3, SPEC §11.1).
 * @param {{vars:{context:string, note:string|null, awayMin:number}}} fx
 * @param {{copy:any, sites:string[]}} opts
 */
export function welcomeModel(fx, { copy, sites }) {
  const shown = sites.slice(0, 3);
  const vars = { context: shorten(fx.vars.context || "your task"), note: fx.vars.note ?? "", sites: shown.join(", ") };
  return {
    kind: /** @type {const} */ ("welcome"),
    label: copy.ui.welcome_title,
    title: copy.ui.welcome_title,
    note: fx.vars.note ? fill(copy.ui.your_note, vars) : null,
    message: fill(pick(copy.welcome_back, vars.context), vars),
    sites: shown.length ? fill(copy.ui.sites, vars) : null,
    ui: fillAll(copy.ui, vars),
  };
}
