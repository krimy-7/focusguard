// @ts-check
/** SPEC §10.3: never shown to users, from templates or AI. */
export const BANNED = ["lazy", "failed", "wasted", "distracted again", "you should have", "disappointing"];

/** @param {string} text */
export function hasBanned(text) {
  const t = String(text).toLowerCase();
  return BANNED.some((w) => t.includes(w));
}

/**
 * Replace {name} placeholders; missing values become "".
 * @param {string} template
 * @param {Record<string, unknown>} vars
 */
export function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k])));
}

/**
 * Deterministic pick, so the same intervention always shows the same line.
 * @template T
 * @param {T[]} list
 * @param {string} seed
 * @returns {T}
 */
export function pick(list, seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + (ch.codePointAt(0) ?? 0)) | 0;
  return list[Math.abs(h) % list.length];
}
