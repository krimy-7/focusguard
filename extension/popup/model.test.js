// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseUntil, PAUSE_OFF, fmtMinutes, phaseLabel, recentSites, validQuietHours, driftDomains, aiDisclosure, hostPattern } from './model.js';

const NOW = new Date(2026, 9, 10, 23, 30).getTime(); // 23:30 local

test('pauseUntil: 30 min, next local midnight, off', () => {
  assert.equal(pauseUntil('30m', NOW), NOW + 30 * 60_000);
  const t = pauseUntil('tomorrow', NOW);
  assert.equal(new Date(t).getHours(), 0);
  assert.equal(new Date(t).getDate(), 11);
  assert.ok(t > NOW && t - NOW <= 24 * 3600_000);
  assert.equal(pauseUntil('off', NOW), PAUSE_OFF);
});

test('fmtMinutes and phaseLabel', () => {
  assert.equal(fmtMinutes(42.4), '42 min');
  assert.equal(fmtMinutes(65), '1 h 5 min');
  assert.equal(phaseLabel('grace', null, NOW), 'Taking a detour');
  assert.equal(phaseLabel('active', NOW + 1, NOW), 'Paused');
  assert.equal(phaseLabel('active', NOW - 1, NOW), 'Focused');
});

test('recentSites: hostnames only, most recent first, unique, at most 3', () => {
  const resume = { lastUrl: 'https://www.figma.com/file/secret', tabs: [
    { url: 'https://github.com/a/b' }, { url: 'chrome://settings' }, { url: 'https://docs.google.com/x' },
    { url: 'not a url' }, { url: 'https://figma.com/y' }, { url: 'https://stackoverflow.com/q/1' }] };
  assert.deepEqual(recentSites(resume), ['figma.com', 'stackoverflow.com', 'docs.google.com']);
  assert.deepEqual(recentSites(null), []);
  assert.ok(!recentSites(resume).join(' ').includes('secret'));
});

test('validQuietHours keeps complete valid rows, max 3', () => {
  const rows = [{ from: '22:00', to: '07:00' }, { from: '', to: '08:00' }, { from: '12:00', to: '12:00' },
    { from: '25:00', to: '01:00' }, { from: '13:00', to: '14:00' }, { from: '15:00', to: '16:00' }, { from: '17:00', to: '18:00' }];
  assert.deepEqual(validQuietHours(rows), [{ from: '22:00', to: '07:00' }, { from: '13:00', to: '14:00' }, { from: '15:00', to: '16:00' }]);
});

test('driftDomains picks yellow/red seed domains, honouring per-domain overrides', () => {
  const seed = { labels: { code: { tier: 'green' }, video: { tier: 'yellow' }, social: { tier: 'red' } },
    domains: { 'github.com': { label: 'code' }, 'youtube.com': { label: 'video' }, 'reddit.com': { label: 'social' },
      'pinterest.com': { label: 'social', tier: 'yellow' }, 'figma.com': { label: 'code', tier: 'green' } } };
  assert.deepEqual(driftDomains(seed), ['pinterest.com', 'reddit.com', 'youtube.com']);
  assert.deepEqual(driftDomains(null), []);
});

test('aiDisclosure says exactly where data goes', () => {
  assert.match(aiDisclosure({ mode: 'off' }), /Nothing is sent/);
  assert.match(aiDisclosure({ mode: 'nano' }), /Nothing leaves your browser/);
  assert.match(aiDisclosure({ mode: 'local', baseUrl: 'http://localhost:11434' }), /^Sent to localhost:11434 on your computer: the site name/);
  const key = aiDisclosure({ mode: 'key', provider: 'anthropic', apiKey: 'k', model: 'm' });
  assert.match(key, /^Sent to api\.anthropic\.com: /);
  assert.match(key, /goal titles/);
  assert.match(key, /key stays in this browser/);
});

test('hostPattern keeps the port, drops the path; bad URLs throw', () => {
  assert.equal(hostPattern('http://localhost:11434/v1/chat/completions'), 'http://localhost:11434/*');
  assert.equal(hostPattern('https://api.anthropic.com/v1/messages'), 'https://api.anthropic.com/*');
  assert.throws(() => hostPattern('not a url'));
});
