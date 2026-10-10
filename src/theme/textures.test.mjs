import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRICK_SVG, GRAIN_SVG, PLASTER_SVG, svgUrl } from './textures.ts';

const brand = (n) => readFileSync(new URL(`../../extension/brand/${n}.svg`, import.meta.url), 'utf8').trim();

test('embedded textures match the canonical brand SVGs', () => {
  assert.equal(BRICK_SVG, brand('brick'));
  assert.equal(GRAIN_SVG, brand('grain'));
  assert.equal(PLASTER_SVG, brand('plaster'));
});

test('svgUrl yields a data URI that round-trips', () => {
  const u = svgUrl('<svg a="1"/>');
  assert.ok(u.startsWith('url("data:image/svg+xml,'));
  assert.equal(decodeURIComponent(u.slice('url("data:image/svg+xml,'.length, -2)), '<svg a="1"/>');
});
