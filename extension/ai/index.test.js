// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAI, parseJson, guardClassify, guardName, classifyPrompt, namePrompt } from './index.js';
import { endpointFor } from './providers.js';

/** Fake fetch answering every call with `reply(url, init)` → [status, json]. */
function fakeFetch(reply) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers || {}, body: init.body ? JSON.parse(String(init.body)) : null, signal: init.signal });
    const [status, json] = await reply(String(url), init);
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  };
  return { fn, calls };
}

const openaiReply = (content) => () => [200, { choices: [{ message: { role: 'assistant', content } }] }];
const IN = { host: 'youtube.com', title: 'React hooks tutorial', contextTitle: 'FocusGuard popup' };

function make(opt, reply, extra = {}) {
  const f = fakeFetch(reply);
  const ai = createAI({ fetch: /** @type {any} */ (f.fn), getOption: async () => opt, LanguageModel: () => undefined, ...extra });
  return { ai, calls: f.calls };
}

test('off (or no option stored) returns null without any request', async () => {
  for (const opt of [{ mode: 'off' }, undefined]) {
    const { ai, calls } = make(opt, openaiReply('{}'));
    assert.equal(await ai.classify(IN), null);
    assert.equal(await ai.nameContext({ host: 'github.com', title: 'x', goals: [] }), null);
    assert.equal(calls.length, 0);
  }
});

test('local: OpenAI-compatible chat completions at the user URL, no auth header', async () => {
  const { ai, calls } = make({ mode: 'local', baseUrl: 'http://localhost:11434/v1/', model: 'llama3.2' },
    openaiReply('{"tier":"yellow","related":true}'));
  assert.deepEqual(await ai.classify(IN), { tier: 'yellow', related: true });
  assert.equal(calls[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(calls[0].headers.authorization, undefined);
  assert.equal(calls[0].body.model, 'llama3.2');
  assert.equal(calls[0].body.messages[0].role, 'system');
});

test('key/openai: default base URL and bearer key', async () => {
  const { ai, calls } = make({ mode: 'key', provider: 'openai', apiKey: 'sk-test', model: 'gpt-x' },
    openaiReply('{"title":"Popup redesign","mode":"work"}'));
  assert.deepEqual(await ai.nameContext({ host: 'github.com', title: 'focusguard/popup.js', goals: ['Popup redesign'] }), { title: 'Popup redesign', mode: 'work' });
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].headers.authorization, 'Bearer sk-test');
});

test('key/anthropic: Messages API headers and text block', async () => {
  const { ai, calls } = make({ mode: 'key', provider: 'anthropic', apiKey: 'sk-ant', model: 'claude-x' },
    () => [200, { content: [{ type: 'text', text: '{"tier":"red","related":false}' }] }]);
  assert.deepEqual(await ai.classify(IN), { tier: 'red', related: false });
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].headers['x-api-key'], 'sk-ant');
  assert.equal(calls[0].headers['anthropic-version'], '2023-06-01');
  assert.equal(calls[0].headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(calls[0].body.max_tokens, 100);
  assert.equal(typeof calls[0].body.system, 'string');
});

test('key/gemini: generateContent with the key in a header, never in the URL', async () => {
  const { ai, calls } = make({ mode: 'key', provider: 'gemini', apiKey: 'g-key', model: 'models/gemini-x' },
    () => [200, { candidates: [{ content: { parts: [{ text: '{"tier":"green","related":true}' }] } }] }]);
  assert.deepEqual(await ai.classify(IN), { tier: 'green', related: true });
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
  assert.equal(calls[0].headers['x-goog-api-key'], 'g-key');
  assert.doesNotMatch(calls[0].url, /g-key/);
  assert.equal(calls[0].body.generationConfig.responseMimeType, 'application/json');
});

test('guard rejects junk: prose, wrong enums, long titles, banned words, newlines', async () => {
  assert.equal(parseJson('Sure! {"tier":"red"}'), null);
  assert.equal(parseJson('[1]'), null);
  assert.deepEqual(parseJson('```json\n{"tier":"red","related":false}\n```'), { tier: 'red', related: false });
  assert.equal(guardClassify({ tier: 'purple', related: true }), null);
  assert.equal(guardClassify({ tier: 'red', related: 'yes' }), null);
  assert.equal(guardName({ title: 'x'.repeat(61), mode: 'work' }), null);
  assert.deepEqual(guardName({ title: 'x'.repeat(60), mode: 'work' }), { title: 'x'.repeat(60), mode: 'work' });
  assert.equal(guardName({ title: 'Recovering wasted time', mode: 'work' }), null);
  assert.equal(guardName({ title: 'Not LAZY today', mode: 'work' }), null);
  assert.equal(guardName({ title: 'Line\nbreak', mode: 'work' }), null);
  assert.equal(guardName({ title: 'Fine', mode: 'chores' }), null);
  assert.equal(guardName({ title: '   ', mode: 'work' }), null);
});

test('guard rejection end to end: a non-JSON reply from the model gives null', async () => {
  const { ai } = make({ mode: 'local', baseUrl: 'http://localhost:1234', model: 'm' }, openaiReply('I think this is green.'));
  assert.equal(await ai.classify(IN), null);
});

test('HTTP errors and network failures give null', async () => {
  assert.equal(await make({ mode: 'local', baseUrl: 'http://localhost:1234', model: 'm' }, () => [500, {}]).ai.classify(IN), null);
  assert.equal(await make({ mode: 'local', baseUrl: 'http://localhost:1234', model: 'm' }, () => { throw new TypeError('Failed to fetch'); }).ai.classify(IN), null);
});

test('incomplete options give null without a request', async () => {
  const { ai, calls } = make({ mode: 'key', provider: 'openai', model: 'gpt-x' }, openaiReply('{}'));
  assert.equal(await ai.classify(IN), null);
  assert.equal(calls.length, 0);
});

test('a provider that never answers times out to null and the request is aborted', async () => {
  let signal;
  const { ai } = make({ mode: 'local', baseUrl: 'http://localhost:1234', model: 'm' },
    (_u, init) => { signal = init.signal; return new Promise(() => {}); }, { timeoutMs: 30 });
  const t0 = Date.now();
  assert.equal(await ai.classify(IN), null);
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(signal.aborted, true);
});

test('prompts carry only host, sanitized title, context title and goal titles', async () => {
  const { ai, calls } = make({ mode: 'local', baseUrl: 'http://localhost:1234', model: 'm' }, openaiReply('{"tier":"red","related":false}'));
  await ai.classify(/** @type {any} */ ({ host: 'mail.example.com', title: 'Invoice 12345678 for jane@x.com https://evil.example/a?b',
    contextTitle: 'Tax prep', url: 'https://mail.example.com/secret-path', tabId: 7 }));
  const sent = JSON.stringify(calls[0].body);
  for (const leak of ['12345678', 'jane@x.com', 'evil.example', 'secret-path', '"tabId"']) assert.ok(!sent.includes(leak), leak);
  assert.match(sent, /mail\.example\.com/);
  assert.match(sent, /Tax prep/);
  const p = namePrompt({ host: 'github.com', title: 'PR #1', goals: ['Ship popup', 'Call 98123456'] });
  assert.match(p.user, /- Ship popup/);
  assert.doesNotMatch(p.user, /98123456/);
  assert.match(classifyPrompt(IN).user, /^Site: youtube\.com\nPage title: React hooks tutorial\nCurrent task: FocusGuard popup$/);
});

test('nano: uses the Prompt API with a JSON schema when the model is available', async () => {
  let constraint;
  const LM = { availability: async () => 'available',
    create: async () => ({ prompt: async (_t, o) => { constraint = o.responseConstraint; return '{"tier":"green","related":true}'; }, destroy() {} }) };
  const { ai } = make({ mode: 'nano' }, openaiReply(''), { LanguageModel: () => LM });
  assert.deepEqual(await ai.classify(IN), { tier: 'green', related: true });
  assert.deepEqual(constraint.required, ['tier', 'related']);
});

test('nano: never triggers a download from the background', async () => {
  let created = false;
  const LM = { availability: async () => 'downloadable', create: async () => { created = true; } };
  const { ai } = make({ mode: 'nano' }, openaiReply(''), { LanguageModel: () => LM });
  assert.equal(await ai.classify(IN), null);
  assert.equal(created, false);
  assert.equal(await make({ mode: 'nano' }, openaiReply('')).ai.classify(IN), null); // no LanguageModel at all
});

test('endpointFor names the exact URL used (for permissions and the disclosure line)', () => {
  assert.equal(endpointFor({ mode: 'off' }), null);
  assert.equal(endpointFor({ mode: 'local', baseUrl: 'http://127.0.0.1:1234/' }), 'http://127.0.0.1:1234/v1/chat/completions');
  assert.equal(endpointFor({ mode: 'key', provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1' }), 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(endpointFor({ mode: 'key', provider: 'anthropic' }), 'https://api.anthropic.com/v1/messages');
});
