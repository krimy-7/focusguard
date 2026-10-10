// @ts-check
// FocusGuard privacy floor. Pure ESM, imported by shell/adapters.js.
// Tests: extension/shell/test/privacy.test.js

// Hosts we never observe: finance, health, password managers, private
// messaging, government/tax. Matching tabs become blind landings (host:null)
// and never reach the engine.
// ponytail: hardcoded list; users add their own via fg_extra_sensitive (shell/adapters.js).
const SENSITIVE_HOST =
  /paypal|bank|esewa|khalti|(^|\.)chase\.com$|1password|bitwarden|lastpass|mychart|healthcare|(^|\.)web\.whatsapp\.com$|(^|\.)messenger\.com$|(^|\.)mail\.proton\.me$|(^|\.)gov(\.[a-z]{2})?$/i;

/** @param {string|null|undefined} host */
export function isSensitiveHost(host) {
  return SENSITIVE_HOST.test(host || "");
}

/**
 * Strip emails and long digit runs (order/account/phone numbers) from a tab title.
 * @param {unknown} title
 * @returns {string}
 */
export function sanitizeTitle(title) {
  return String(title || "")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "")
    .replace(/\d{4,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
