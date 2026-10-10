// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, graceFor } from '../step.js';

const MIN = 60;

test('graceFor: engine notes §2.4 worked results at base 300', () => {
  assert.equal(graceFor('red', 60 * MIN, DEFAULTS), 120);
  assert.equal(graceFor('red', 30 * MIN, DEFAULTS), 210);
  assert.equal(graceFor('yellow', 5 * MIN, DEFAULTS), 360);
  assert.equal(graceFor('yellow', 60 * MIN, DEFAULTS), 144);
});

test('graceFor: high-momentum floor never lengthens grace (base 60 → 60)', () => {
  assert.equal(graceFor('red', 60 * MIN, { ...DEFAULTS, GRACE_DEFAULT_S: 60 }), 60);
  assert.equal(graceFor('yellow', 60 * MIN, { ...DEFAULTS, GRACE_DEFAULT_S: 60 }), 60);
});

test('graceFor: momentum band edges (20 min is mid, 45 min is still mid)', () => {
  assert.equal(graceFor('red', 20 * MIN - 1, DEFAULTS), 300);
  assert.equal(graceFor('red', 20 * MIN, DEFAULTS), 210);
  assert.equal(graceFor('red', 45 * MIN, DEFAULTS), 210);
  assert.equal(graceFor('red', 45 * MIN + 1, DEFAULTS), 120);
});

test('graceFor: clamped to [GRACE_MIN_S, GRACE_MAX_S]', () => {
  assert.equal(graceFor('yellow', 0, { ...DEFAULTS, GRACE_DEFAULT_S: 900 }), 900); // 1080 → 900
  assert.equal(graceFor('red', 30 * MIN, { ...DEFAULTS, GRACE_DEFAULT_S: 60 }), 60); // 42 → 60
});

test('DEFAULTS is frozen, including nested tables', () => {
  assert.ok(Object.isFrozen(DEFAULTS));
  assert.ok(Object.isFrozen(DEFAULTS.MOMENTUM_FACTOR));
  assert.ok(Object.isFrozen(DEFAULTS.RISK_FACTOR));
  assert.ok(Object.isFrozen(DEFAULTS.EXTEND_OPTIONS_S));
  assert.equal(DEFAULTS.GRACE_DEFAULT_S, 300);
});
