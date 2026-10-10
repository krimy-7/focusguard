// @ts-check
// Static checks for E's pages: ids used by scripts exist, no duplicate ids,
// no inline or remote scripts (MV3 CSP / no remote code), every local script exists,
// and every <title> carries the R39 product name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ext = new URL('../', import.meta.url);
const read = (/** @type {string} */ p) => readFileSync(new URL(p, ext), 'utf8');

/** [page, scripts that query it with $('id')] — paths relative to extension/ */
const PAGES = [
  ['popup/popup.html', ['popup/popup.js', 'popup/settings.js']],
  ['auth/google.html', ['auth/google.js']],
  ['onboarding/onboarding.html', ['onboarding/onboarding.js']],
  ['onboarding/privacy.html', []],
  ['blocked.html', ['beast/blocked.js']],
];

for (const [page, scripts] of PAGES) {
  test(`${page}: ids, scripts and CSP`, () => {
    const html = read(page);
    const ids = (html.match(/\bid="[^"]+"/g) || []);
    assert.equal(new Set(ids).size, ids.length, 'duplicate id');
    for (const s of scripts) {
      for (const [, id] of read(s).matchAll(/\$\('([A-Za-z]+)'\)/g)) assert.ok(html.includes(`id="${id}"`), `${s} uses #${id}, missing from ${page}`);
    }
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'inline <script> is blocked by MV3 CSP');
    assert.doesNotMatch(html, /\b(src|href)="https?:/, 'no remote scripts, styles or fonts');
    assert.match(html, /<title>[^<]*FocusGuard AI[^<]*<\/title>/, 'R39: user-visible name is "FocusGuard AI"');
    for (const [, src] of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) assert.ok(existsSync(new URL(src, new URL(page, ext))), `missing ${src}`);
  });
}

test('R40: "Continue with Google" is the first, primary sign-in button; "Email me a code" is the secondary option below it', () => {
  const html = read('popup/popup.html');
  const google = html.indexOf('id="googleBtn"');
  assert.ok(google > 0 && google < html.indexOf('id="emailForm"'), 'Google button must come before the email form');
  assert.match(html, /<button class="btn primary" id="googleBtn"/);
  assert.match(html, /<form id="emailForm"[\s\S]*?<button class="btn" type="submit">Email me a code<\/button>/);
});
