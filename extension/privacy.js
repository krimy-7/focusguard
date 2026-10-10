// FocusGuard privacy floor. Loaded by background.js via importScripts.
// Self-check: `node extension/privacy.js`.

// Hosts we never observe: finance, health, password managers, private
// messaging, government/tax. Matching tabs send nothing and are never
// treated as context or distraction.
// ponytail: hardcoded list; make it user-editable if false positives show up.
const SENSITIVE_HOST =
  /paypal|bank|esewa|khalti|(^|\.)chase\.com$|1password|bitwarden|lastpass|mychart|healthcare|(^|\.)web\.whatsapp\.com$|(^|\.)messenger\.com$|(^|\.)mail\.proton\.me$|(^|\.)gov(\.[a-z]{2})?$/i;

function isSensitiveHost(host) {
  return SENSITIVE_HOST.test(host || "");
}

// Strip emails and long digit runs (order/account/phone numbers) from a tab
// title before it can leave the browser.
function sanitizeTitle(title) {
  return String(title || "")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "")
    .replace(/\d{4,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

if (typeof module !== "undefined" && require.main === module) {
  const assert = require("assert");
  assert.strictEqual(sanitizeTitle("Inbox (3) - jane.doe@gmail.com - Gmail"), "Inbox (3) - - Gmail");
  assert.strictEqual(sanitizeTitle("Order 123456789   shipped\n"), "Order shipped");
  assert.strictEqual(sanitizeTitle("x".repeat(300)).length, 120);
  assert.strictEqual(sanitizeTitle(undefined), "");
  for (const h of ["www.paypal.com", "online.chase.com", "web.whatsapp.com", "irs.gov", "nepal.gov.np", "vault.bitwarden.com", "mail.proton.me"])
    assert.ok(isSensitiveHost(h), h);
  for (const h of ["github.com", "purchase.example.com", "governance.io", "whatsapp.com", "proton.me", ""])
    assert.ok(!isSensitiveHost(h), h);
  console.log("privacy.js ok");
}
