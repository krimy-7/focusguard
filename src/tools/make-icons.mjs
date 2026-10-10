// Rasterizes the Yeti-in-window mark to the PNGs app.json needs (assets/images/*).
// Source art is read straight from the canonical brand SVGs in extension/brand/ (yeti, lattice, brick, grain);
// nothing is redrawn by hand except the window geometry, which mirrors components/brand.tsx (size "mark").
// Rendering uses headless Chrome/Edge. Run: node src/tools/make-icons.mjs   (CHROME=<path> to override the browser)
// Re-running replaces the PNGs, so re-embed their provenance afterwards (impeccable embed-prompt <png> --prompt-file <txt>).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const brand = (n) => readFileSync(new URL(`extension/brand/${n}.svg`, root), 'utf8').trim();
const out = fileURLToPath(new URL('assets/images/', root));

const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('No Chrome/Edge found. Set CHROME=<path to browser>.');

const body = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const YETI = body(brand('yeti')); // <defs><g id="yeti-fur">… plus the painted layers
const FUR = YETI.match(/<g id="yeti-fur">([\s\S]*?)<\/g>/)[1];
const LATTICE_DEFS = brand('lattice').match(/<defs>[\s\S]*<\/defs>/)[0];
const dataUrl = (svg) => `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;

// The mark at 44 units: carved frame, cream pane with the Yeti looking out, brass-stiled lattice leaf at the right.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="100%" height="100%">
  ${LATTICE_DEFS}
  <defs><clipPath id="pane"><rect x="3" y="3" width="38" height="36"/></clipPath><clipPath id="leaf"><rect x="30" y="3" width="11" height="36"/></clipPath></defs>
  <rect width="44" height="44" rx="4" fill="#2B1E17"/>
  <rect x="3" y="3" width="38" height="36" fill="#FBF6EC"/>
  <g clip-path="url(#pane)"><svg x="4" y="9" width="34" height="34" viewBox="0 0 64 64">${YETI}</svg></g>
  <g clip-path="url(#leaf)"><rect x="30" y="3" width="11" height="36" fill="#E9D9B5"/><rect x="33" y="3" width="8" height="36" fill="url(#lat)"/><rect x="30" y="3" width="3" height="36" fill="#C8963E"/></g>
  <rect x="3.5" y="3.5" width="37" height="35" fill="none" stroke="rgba(200,150,62,0.55)" stroke-width="1"/>
</svg>`;

// One-colour version for Android themed icons (alpha only): frame ring, lattice leaf strokes, Yeti fur silhouette with an open face.
const MONO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="100%" height="100%">
  <defs>
    <clipPath id="pane"><rect x="3" y="3" width="38" height="36"/></clipPath>
    <mask id="face"><rect width="64" height="64" fill="#fff"/>
      <path d="M32 19.5C41.5 19.5 48 25.5 48 33.5C48 41.5 41.5 47.5 32 47.5C22.5 47.5 16 41.5 16 33.5C16 25.5 22.5 19.5 32 19.5Z" fill="#000"/>
    </mask>
  </defs>
  <path fill-rule="evenodd" d="M4 0H40A4 4 0 0 1 44 4V40A4 4 0 0 1 40 44H4A4 4 0 0 1 0 40V4A4 4 0 0 1 4 0ZM3 3V39H41V3Z"/>
  <g clip-path="url(#pane)"><svg x="4" y="9" width="34" height="34" viewBox="0 0 64 64">
    <g mask="url(#face)" fill="#000" stroke="#000" stroke-width="1.6" stroke-linejoin="round">${FUR}</g>
    <circle cx="26" cy="34" r="2.4"/><circle cx="38" cy="34" r="2.4"/>
    <path d="M28.2 42.5q3.8 2.8 7.6 0" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round"/>
  </svg></g>
  <path d="M30 3V39M33 9L41 17M41 9L33 17M33 21L41 29M41 21L33 29M33 33L41 39" stroke="#000" stroke-width="1.6" fill="none"/>
</svg>`;

const BRICK_CSS = (scale) => `
  background-color:#9A3E24;
  background-image:${dataUrl(brand('grain'))},${dataUrl(brand('brick'))};
  background-size:${180 * scale}px ${180 * scale}px,${96 * scale}px ${40 * scale}px;
  background-blend-mode:multiply,normal;`;

// name, size, page body. `bg` pages paint their own opaque background; others stay transparent.
const ASSETS = [
  ['icon.png', 1024, `<div style="width:1024px;height:1024px;display:grid;place-items:center;${BRICK_CSS(3.4)}"><div style="width:600px;height:600px;filter:drop-shadow(0 22px 28px rgba(30,10,4,.45))">${MARK}</div></div>`],
  ['favicon.png', 96, `<div style="width:96px;height:96px">${MARK}</div>`],
  ['splash-icon.png', 1024, `<div style="width:1024px;height:1024px;display:grid;place-items:center"><div style="width:960px;height:960px">${MARK}</div></div>`],
  ['android-icon-foreground.png', 1024, `<div style="width:1024px;height:1024px;display:grid;place-items:center"><div style="width:540px;height:540px">${MARK}</div></div>`],
  ['android-icon-background.png', 1024, `<div style="width:1024px;height:1024px;${BRICK_CSS(3.4)}"></div>`],
  ['android-icon-monochrome.png', 1024, `<div style="width:1024px;height:1024px;display:grid;place-items:center"><div style="width:540px;height:540px">${MONO}</div></div>`],
];

mkdirSync(out, { recursive: true });
const dir = join(tmpdir(), 'focusguard-icons');
mkdirSync(dir, { recursive: true });
for (const [name, size, html] of ASSETS) {
  const page = join(dir, `${name}.html`);
  writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style>${html}`);
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--virtual-time-budget=4000',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${join(out, name)}`,
    `file:///${page.replace(/\\/g, '/')}`,
  ], { stdio: 'ignore' });
  console.log(`wrote assets/images/${name} (${size}x${size})`);
}
