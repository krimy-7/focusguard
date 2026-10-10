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
  ['popup/popup.html', ['popup/popup.js']],
  ['popup/options.html', ['popup/options.js', 'popup/settings.js']], // Settings moved out of the popup into the options page
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

test('every page uses the shared tokens, and every bundled font and brand asset they reference exists (no remote fonts)', () => {
  const css = read('styles/tokens.css');
  for (const [, f] of css.matchAll(/url\("\.\.\/([^")]+\.(?:woff2|svg))"\)/g)) assert.ok(existsSync(new URL(f, ext)), `tokens.css references missing ${f}`);
  assert.doesNotMatch(css, /(?:url\(|@import)\s*["']?https?:/, 'no remote URLs in tokens.css');
  for (const [page] of PAGES) assert.match(read(page), /<link rel="stylesheet" href="(\.\.\/)?styles\/tokens\.css"/, `${page} must load styles/tokens.css`);
});

test('the task window: the state chip sits below the title (never a kicker above it), and the Yeti sits under the leaf so closing covers him', () => {
  const html = read('popup/popup.html');
  const win = html.slice(html.indexOf('id="ctxWin"')); // the header's mark window comes earlier in the file
  const at = (/** @type {string} */ s) => win.indexOf(s);
  assert.ok(at('id="ctxTitle"') > 0 && at('id="ctxTitle"') < at('id="phasePill"'), 'phasePill must come after ctxTitle');
  assert.ok(at('win__leaf') < at('win__yeti') && at('win__yeti') < at('win__pane'), 'yeti is painted under the leaf, beside the words');
  const css = read('popup/popup.css');
  assert.match(css, /\.pill\s*\{[^}]*background:\s*var\(--pill-bg\)/, 'the chip stays filled');
  assert.doesNotMatch(css.match(/\.pill\s*\{[^}]*\}/)?.[0] ?? '', /text-transform|letter-spacing/, 'sentence case, normal tracking');
});

test('R40: "Continue with Google" is the first, primary sign-in button; "Email me a code" is the secondary option below it', () => {
  const html = read('popup/popup.html');
  const google = html.indexOf('id="googleBtn"');
  assert.ok(google > 0 && google < html.indexOf('id="emailForm"'), 'Google button must come before the email form');
  assert.match(html, /<button class="btn primary" id="googleBtn"/);
  assert.match(html, /<form id="emailForm"[\s\S]*?<button class="btn" type="submit">Email me a code<\/button>/);
});
