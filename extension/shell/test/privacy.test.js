// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSensitiveHost, sanitizeTitle } from "../../privacy.js";

test("sanitizeTitle strips emails and long digit runs, caps at 120", () => {
  assert.equal(sanitizeTitle("Inbox (3) - jane.doe@gmail.com - Gmail"), "Inbox (3) - - Gmail");
  assert.equal(sanitizeTitle("Order 123456789   shipped\n"), "Order shipped");
  assert.equal(sanitizeTitle("x".repeat(300)).length, 120);
  assert.equal(sanitizeTitle(undefined), "");
});

test("isSensitiveHost matches finance, health, messaging, gov", () => {
  for (const h of ["www.paypal.com", "online.chase.com", "web.whatsapp.com", "irs.gov", "nepal.gov.np", "vault.bitwarden.com", "mail.proton.me"])
    assert.ok(isSensitiveHost(h), h);
  for (const h of ["github.com", "purchase.example.com", "governance.io", "whatsapp.com", "proton.me", ""])
    assert.ok(!isSensitiveHost(h), h);
  assert.equal(isSensitiveHost(null), false);
});
