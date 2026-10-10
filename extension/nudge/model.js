// @ts-check
// Pure: engine effect → plain JSON for renderCard (executeScript args must be serializable).
import { fill, pick } from "../copy/copy.js";

/** "+5 min" on the card and the notification. */
export const EXTEND_S = 300;
const MASCOT = "🦉";

/** @param {Record<string,string>} ui @param {Record<string, unknown>} vars */
const fillAll = (ui, vars) => Object.fromEntries(Object.entries(ui).map(([k, v]) => [k, fill(v, vars)]));

/**
 * @param {{level:1|2, interventionId:string, copyKey:string, vars:{context:string, awayMin:number}}} fx
 * @param {{copy:any, seenLevels:number[], settingsUrl:string}} opts
 */
export function nudgeModel(fx, { copy, seenLevels, settingsUrl }) {
  const vars = { context: fx.vars.context || "your task" };
  /** @type {string[]} */
  const lines = copy[fx.copyKey] ?? copy[`nudge_l${fx.level}`]; // R36 keys: nudge_l1 / nudge_l2
  return {
    kind: /** @type {const} */ ("nudge"),
    level: fx.level,
    interventionId: fx.interventionId,
    label: copy.ui.card_label,
    mascot: fx.level === 2 ? MASCOT : null,
    message: fill(pick(lines, fx.interventionId), vars),
    explainer: seenLevels.includes(fx.level) ? null : fill(copy.explainer[String(fx.level)], vars),
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
  const vars = { context: fx.vars.context || "your task", note: fx.vars.note ?? "", sites: shown.join(", ") };
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
