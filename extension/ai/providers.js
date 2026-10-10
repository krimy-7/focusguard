// @ts-check
// One function per AI backend. Each returns the model's raw text; index.js parses and guards it.

/** @typedef {{mode:'off'|'nano'|'local'|'key', baseUrl?:string, apiKey?:string, provider?:'openai'|'anthropic'|'gemini', model?:string}} AiOption */
/** @typedef {{system:string, user:string, schema:object}} Prompt */
/** @typedef {{fetch: typeof fetch, signal: AbortSignal, LanguageModel?: any}} CallDeps */

const OPENAI_BASE = 'https://api.openai.com';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

/** "http://localhost:11434/v1/" → "http://localhost:11434" @param {string} base */
const trimBase = (base) => base.trim().replace(/\/+$/, '').replace(/\/v1$/, '');

/** The URL a request for this option goes to (also used to ask for host access and in the disclosure line).
 *  @param {AiOption} opt @returns {string|null} */
export function endpointFor(opt) {
  if (opt.mode === 'local') return opt.baseUrl ? `${trimBase(opt.baseUrl)}/v1/chat/completions` : null;
  if (opt.mode !== 'key') return null;
  if (opt.provider === 'anthropic') return ANTHROPIC_URL;
  if (opt.provider === 'gemini') return `${GEMINI_BASE}${encodeURIComponent((opt.model || '').replace(/^models\//, ''))}:generateContent`;
  return `${trimBase(opt.baseUrl || OPENAI_BASE)}/v1/chat/completions`;
}

/** @param {Response} res */
async function json(res) {
  if (!res.ok) throw new Error(`AI provider HTTP ${res.status}`);
  return res.json();
}

/** @param {AiOption} opt @param {Prompt} p @param {CallDeps} d @returns {Promise<string>} */
export async function callProvider(opt, p, d) {
  if (opt.mode === 'nano') return nano(p, d);
  const url = endpointFor(opt);
  if (!url || !opt.model) throw new Error('AI option incomplete');
  if (opt.mode === 'key' && !opt.apiKey) throw new Error('AI key missing');

  if (opt.mode === 'key' && opt.provider === 'anthropic') {
    const data = await json(await d.fetch(url, { method: 'POST', signal: d.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': String(opt.apiKey),
        'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: opt.model, max_tokens: 100, system: p.system, messages: [{ role: 'user', content: p.user }] }) }));
    return (data.content || []).find((/** @type {any} */ b) => b.type === 'text')?.text ?? '';
  }

  if (opt.mode === 'key' && opt.provider === 'gemini') {
    const data = await json(await d.fetch(url, { method: 'POST', signal: d.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': String(opt.apiKey) },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: p.system }] },
        contents: [{ role: 'user', parts: [{ text: p.user }] }],
        generationConfig: { responseMimeType: 'application/json' } }) }));
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  // OpenAI-compatible: OpenAI, OpenRouter, Groq, Ollama, LM Studio …
  /** @type {Record<string,string>} */
  const headers = { 'content-type': 'application/json' };
  if (opt.mode === 'key') headers.authorization = `Bearer ${opt.apiKey}`;
  const data = await json(await d.fetch(url, { method: 'POST', signal: d.signal, headers,
    body: JSON.stringify({ model: opt.model, messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }] }) }));
  return data.choices?.[0]?.message?.content ?? '';
}

/** Chrome built-in Prompt API. Never starts a model download here: that needs a click in Settings.
 *  @param {Prompt} p @param {CallDeps} d */
async function nano(p, d) {
  const LM = d.LanguageModel;
  if (!LM || (await LM.availability()) !== 'available') throw new Error('On-device model not ready');
  const session = await LM.create({ initialPrompts: [{ role: 'system', content: p.system }], signal: d.signal });
  try { return await session.prompt(p.user, { responseConstraint: p.schema, signal: d.signal }); }
  finally { session.destroy?.(); }
}
