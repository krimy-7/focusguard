// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyOf, matchHost, normalizeHost, tierOf } from '../tiers.js';

const seed = JSON.parse(readFileSync(new URL('../domains.json', import.meta.url), 'utf8'));
const ctx = (/** @type {string[]} */ relatedHosts) => ({ relatedHosts });

test('domains.json: every domain has a known label; every label has tier, mode, title', () => {
  assert.equal(seed.version, 1);
  for (const [name, l] of Object.entries(seed.labels)) {
    assert.ok(['green', 'yellow', 'red'].includes(l.tier), name);
    assert.ok(['work', 'learning', 'personal'].includes(l.mode), name);
    assert.ok(l.title, name);
  }
  for (const [d, e] of Object.entries(seed.domains)) assert.ok(Object.hasOwn(seed.labels, e.label), d);
  assert.equal(Object.keys(seed.domains).length, 100);
  assert.equal(Object.keys(seed.labels).length, 25);
});

test('domains.json tiers follow engine notes §3', () => {
  const tiers = { green: [], yellow: [], red: [] };
  for (const [name, l] of Object.entries(seed.labels)) tiers[l.tier].push(name);
  assert.deepEqual(tiers.green.sort(), ['assistant', 'calendar', 'code', 'course', 'design', 'dev', 'docs', 'files', 'notes', 'planning', 'research', 'search']);
  assert.deepEqual(tiers.yellow.sort(), ['article', 'chat', 'email', 'language', 'music', 'news', 'professional', 'reference', 'shopping', 'video']);
  assert.deepEqual(tiers.red.sort(), ['browsing', 'social', 'streaming']);
});

test('matchHost: longest suffix wins (news.google.com is news, not search)', () => {
  assert.deepEqual(matchHost('news.google.com', seed), { domain: 'news.google.com', label: 'news', tier: 'yellow', mode: 'personal', title: 'Reading news' });
  assert.equal(matchHost('www.google.com', seed)?.label, 'search');
  assert.equal(matchHost('mail.google.com', seed)?.tier, 'yellow');
  assert.equal(matchHost('docs.google.com', seed)?.tier, 'green');
  assert.equal(matchHost('m.youtube.com', seed)?.domain, 'youtube.com');
  assert.equal(matchHost('en.wikipedia.org', seed)?.label, 'reference');
});

test('matchHost: per-domain overrides', () => {
  assert.deepEqual(matchHost('pinterest.com', seed), { domain: 'pinterest.com', label: 'social', tier: 'yellow', mode: 'personal', title: 'Social media' });
  assert.deepEqual(matchHost('discord.com', seed), { domain: 'discord.com', label: 'chat', tier: 'yellow', mode: 'personal', title: 'Team chat' });
  assert.equal(matchHost('geeksforgeeks.org', seed)?.mode, 'learning');
  assert.equal(matchHost('slack.com', seed)?.mode, 'work');
});

test('matchHost: no false suffix matches, case/www/trailing-dot tolerant', () => {
  assert.equal(matchHost('notgithub.com', seed), null);
  assert.equal(matchHost('github.com.evil.io', seed), null);
  assert.equal(matchHost('dropbox.com', seed)?.label, 'files'); // the old x\.com regex matched this as social
  assert.equal(matchHost('WWW.YouTube.com.', seed)?.domain, 'youtube.com');
  assert.equal(matchHost('localhost', seed)?.label, 'dev');
  assert.equal(matchHost('127.0.0.1', seed)?.label, 'dev');
  assert.equal(matchHost('', seed), null);
  assert.equal(matchHost(null, seed), null);
  assert.equal(matchHost('constructor', seed), null);
  assert.equal(matchHost('toString.com', seed), null);
});

test('normalizeHost and keyOf', () => {
  assert.equal(normalizeHost(' WWW.Example.COM. '), 'example.com');
  assert.equal(normalizeHost('LocalHost:3000'), 'localhost'); // R20: strip port
  assert.equal(normalizeHost('[::1]'), '[::1]'); // URL.hostname keeps IPv6 brackets; nothing to strip
  assert.equal(matchHost('127.0.0.1:8000', seed)?.label, 'dev');
  assert.equal(keyOf('www.figma.com', seed), 'figma.com');
  assert.equal(keyOf('m.youtube.com', seed), 'youtube.com');
  assert.equal(keyOf('blog.example.org', seed), 'blog.example.org');
});

test('tierOf: context rule → seed → hint → unknown', () => {
  assert.equal(tierOf('reddit.com', null, seed), 'red');
  assert.equal(tierOf('old.reddit.com', ctx(['reddit.com']), seed), 'green');
  assert.equal(tierOf('youtube.com', ctx(['reddit.com']), seed), 'yellow');
  assert.equal(tierOf('blog.example.org', null, seed), 'unknown');
  assert.equal(tierOf('blog.example.org', null, seed, { 'blog.example.org': { tier: 'red', related: false } }), 'red');
  assert.equal(tierOf('blog.example.org', null, seed, { 'blog.example.org': { tier: 'red', related: true } }), 'green');
  assert.equal(tierOf('youtube.com', null, seed, { 'youtube.com': { tier: 'green', related: false } }), 'yellow'); // seed beats hint
  assert.equal(tierOf(null, null, seed), 'unknown');
});
