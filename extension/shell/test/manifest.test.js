// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const m = JSON.parse(readFileSync(new URL("../../manifest.json", import.meta.url), "utf8"));

test("R39: product name and fixed key pin the extension ID", () => {
  assert.equal(m.name, "FocusGuard AI");
  assert.equal(m.action.default_title, "FocusGuard AI");
  assert.equal(typeof m.key, "string");
  // Chrome's ID = first 16 bytes of sha256(DER public key), each hex nibble 0-f mapped to a-p.
  const hex = createHash("sha256").update(Buffer.from(m.key, "base64")).digest("hex").slice(0, 32);
  const id = [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
  assert.equal(id, "jkkgdjhaoomnjkblodmmjoikglknmifi");
});

test("manifest matches spec §4.1 + R12", () => {
  assert.equal(m.manifest_version, 3);
  assert.equal(m.minimum_chrome_version, "127");
  // R12 adds "identity" (Google sign-in via chrome.identity.launchWebAuthFlow); no "offscreen".
  assert.deepEqual([...m.permissions].sort(), ["alarms", "declarativeNetRequestWithHostAccess", "identity", "idle", "notifications", "scripting", "storage", "tabGroups", "tabs"]);
  assert.deepEqual(m.optional_host_permissions, ["https://*/*", "http://*/*"]);
  assert.deepEqual(m.background, { service_worker: "background.js", type: "module" });
  assert.deepEqual(m.web_accessible_resources, [{ resources: ["blocked.html"], matches: ["<all_urls>"] }]);
  assert.equal(m.action.default_popup, "popup/popup.html");
});

test("no install-time host access and no static content scripts", () => {
  assert.equal(m.host_permissions, undefined);
  assert.equal(m.content_scripts, undefined);
  assert.equal(existsSync(new URL("../../content.js", import.meta.url)), false);
});
