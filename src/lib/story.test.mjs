import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANNED_WORDS, fmtDuration, storyFor } from './story.ts';

const T = (o = {}) => ({
  day: '2026-10-10',
  focus_s: 0,
  nudges: 0,
  self_returns: 0,
  recoveries: 0,
  snoozes: 0,
  breaks: 0,
  longest_detour_s: 0,
  ...o,
});

test('fmtDuration', () => {
  assert.equal(fmtDuration(0), 'under a minute');
  assert.equal(fmtDuration(59), 'under a minute');
  assert.equal(fmtDuration(60), '1 min');
  assert.equal(fmtDuration(3600), '1 h');
  assert.equal(fmtDuration(3660), '1 h 1 min');
  assert.equal(fmtDuration(5400), '1 h 30 min');
});

test('nothing recorded: null, undefined and all-zero days', () => {
  assert.equal(storyFor(null), 'Nothing recorded for this day.');
  assert.equal(storyFor(undefined), 'Nothing recorded for this day.');
  assert.equal(storyFor(T()), 'Nothing recorded for this day.');
});

test('smooth day', () => {
  assert.equal(
    storyFor(T({ focus_s: 5400, nudges: 1, self_returns: 2, breaks: 1 })),
    'A smooth day. You spent 1 h 30 min in focus. FocusGuard AI checked in once. You came back on your own twice. You took a break.',
  );
});

test('hard day is stated neutrally, with the longest detour', () => {
  assert.equal(
    storyFor(T({ focus_s: 3600, nudges: 5, self_returns: 1, recoveries: 3, breaks: 2, longest_detour_s: 1500 })),
    "A bumpy day, and that's okay. You spent 1 h in focus. FocusGuard AI checked in 5 times. You came back on your own once. Your longest detour was 25 min. You took 2 breaks.",
  );
});

test('no check-ins needed', () => {
  assert.equal(storyFor(T({ focus_s: 1200 })), "You spent 20 min in focus. FocusGuard AI didn't need to check in.");
});

test('little focus time is not blamed', () => {
  assert.equal(storyFor(T({ breaks: 1 })), "Not much focus time was recorded. FocusGuard AI didn't need to check in. You took a break.");
});

test('never a banned word, a score or a percentage, across a grid of days', () => {
  for (const focus_s of [0, 30, 600, 1800, 7200])
    for (const nudges of [0, 1, 2, 3, 9])
      for (const self_returns of [0, 1, 4])
        for (const breaks of [0, 1, 3])
          for (const longest_detour_s of [0, 120, 900, 3600]) {
            const s = storyFor(T({ focus_s, nudges, self_returns, breaks, longest_detour_s })).toLowerCase();
            assert.ok(s.length > 0);
            for (const w of BANNED_WORDS) assert.ok(!s.includes(w), `"${w}" in: ${s}`);
            assert.ok(!s.includes('%') && !s.includes('score'), s);
          }
});
