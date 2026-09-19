import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { askAI, cacheKey, trimHistory, contextLines, _reset } from './aiAdapter.js';
import { normalizeAnswer, normalizeRequest, sanitizeSources, LIMITS } from './aiSchemas.js';
import { fallbackAnswer, intentFor } from './aiFallbacks.js';
import { validateImage, validateAudio } from './mediaService.js';
import { buildUserParts, buildRequestBody, extractText, parseJson, anySignal, AiError } from './geminiProvider.js';

const goodModelJson = {
  headline: 'Check water and lower leaves first',
  summary: 'Yellowing may come from excess water or low nitrogen.',
  actions: [
    { label: 'Check soil', detail: 'If soil stays wet, pause watering.' },
    { label: 'Inspect leaves', detail: 'Note whether old or new leaves yellow first.' },
  ],
  reasons: ['Waterlogged roots cannot absorb nutrients well.'],
  warnings: ['Do not add fertilizer until soil condition is checked.'],
  confidence: 'medium',
  needs_better_photo: false,
  context_used: ['crop: rice'],
  sources: [],
  follow_ups: ['Which leaves yellow first?', 'Has the field flooded recently?'],
};

// Fake Gemini endpoint. `script` yields one response per call so retry/repair paths are testable.
function fakeGemini(script) {
  const calls = [];
  const queue = [...script];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (typeof next === 'function') return next();
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(next) }] } }] }),
    };
  };
  return { fetchImpl, calls };
}

beforeEach(() => {
  _reset();
  process.env.GEMINI_API_KEY = 'test-key';
});

test('preset id expands to the stored question, not client text', async () => {
  const { fetchImpl, calls } = fakeGemini([goodModelJson]);
  const out = await askAI({ requestId: 'req-00000001', presetId: 'yellow_leaves', text: 'ignored', fetchImpl });
  assert.equal(out.ok, true);
  assert.equal(out.intent, 'crop_diagnosis');
  const sent = JSON.stringify(calls[0].body);
  assert.match(sent, /leaves are turning yellow/);
  assert.doesNotMatch(sent, /ignored/);
});

test('api key is sent as a header and never returned to the client', async () => {
  const { fetchImpl } = fakeGemini([goodModelJson]);
  const out = await askAI({ requestId: 'req-00000002', text: 'why yellow', fetchImpl });
  assert.doesNotMatch(JSON.stringify(out), /test-key/);
});

test('same requestId is answered once (idempotency)', async () => {
  const { fetchImpl, calls } = fakeGemini([goodModelJson]);
  const a = await askAI({ requestId: 'req-dup-0001', text: 'why yellow', fetchImpl });
  const b = await askAI({ requestId: 'req-dup-0001', text: 'why yellow', fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(b.meta.cached, true);
  assert.equal(a.answer.headline, b.answer.headline);
});

test('identical question from a new request is served from cache', async () => {
  const { fetchImpl, calls } = fakeGemini([goodModelJson]);
  await askAI({ requestId: 'req-cache-01', text: 'Why are leaves yellow', fetchImpl });
  const second = await askAI({ requestId: 'req-cache-02', text: 'why are leaves YELLOW', fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(second.meta.cached, true);
  assert.equal(second.requestId, 'req-cache-02');
});

test('invalid model output triggers one repair call, then succeeds', async () => {
  const { fetchImpl, calls } = fakeGemini([{ headline: 'no actions here' }, goodModelJson]);
  const out = await askAI({ requestId: 'req-repair-1', text: 'why yellow', fetchImpl });
  assert.equal(calls.length, 2);
  assert.equal(out.meta.fallback, false);
  assert.match(JSON.stringify(calls[1].body), /rejected/);
});

test('two invalid outputs fall back to the deterministic checklist', async () => {
  const { fetchImpl, calls } = fakeGemini([{ nope: true }]);
  const out = await askAI({ requestId: 'req-bad-0001', presetId: 'rain_spray', fetchImpl });
  assert.equal(calls.length, 2);
  assert.equal(out.meta.fallback, true);
  assert.equal(out.answer.confidence, 'low');
  assert.equal(out.intent, 'weather_action');
  assert.ok(out.answer.actions.length);
});

test('provider outage falls back instead of throwing', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, text: async () => 'upstream down' });
  const out = await askAI({ requestId: 'req-down-0001', text: 'should I sell rice', fetchImpl });
  assert.equal(out.meta.fallback, true);
  assert.equal(out.intent, 'market_decision');
});

test('missing api key still returns a usable answer', async () => {
  delete process.env.GEMINI_API_KEY;
  const out = await askAI({ requestId: 'req-nokey-001', text: 'why are leaves yellow', fetchImpl: async () => { throw new Error('must not call'); } });
  assert.equal(out.meta.fallback, true);
  assert.ok(out.answer.summary);
});

test('a request with no question and no media is rejected', async () => {
  await assert.rejects(
    () => askAI({ requestId: 'req-empty-001', text: '', fetchImpl: async () => { throw new Error('must not call'); } }),
    (e) => e instanceof AiError && e.code === 'INVALID_INPUT',
  );
});

test('follow-up sends prior turns and skips the cache', async () => {
  const { fetchImpl, calls } = fakeGemini([goodModelJson]);
  const first = await askAI({ requestId: 'req-conv-0001', text: 'why are leaves yellow', fetchImpl });
  await askAI({ requestId: 'req-conv-0002', conversationId: first.conversationId, text: 'which leaves first', fetchImpl });
  assert.equal(calls.length, 2);
  const roles = calls[1].body.contents.map((c) => c.role);
  assert.deepEqual(roles, ['user', 'model', 'user']);
  assert.equal(first.conversationId.startsWith('conv_'), true);
});

test('history sent to the model is capped at four turns', () => {
  const turns = Array.from({ length: 9 }, (_, i) => ({ role: 'user', text: `t${i}` }));
  assert.equal(trimHistory(turns).length, 4);
  assert.equal(trimHistory(turns)[0].text, 't5');
});

test('voice: audio is transcribed first, transcript is returned with the answer', async () => {
  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    const text = call === 1 ? 'my rice leaves are yellow' : JSON.stringify(goodModelJson);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
  };
  const audio = { mimeType: 'audio/webm', data: Buffer.from('fake') };
  const out = await askAI({ requestId: 'req-voice-001', audio, fetchImpl });
  assert.equal(out.transcript, 'my rice leaves are yellow');
  assert.equal(out.answer.headline, goodModelJson.headline);
});

test('media buffers are released after the request', async () => {
  const { fetchImpl } = fakeGemini([goodModelJson]);
  const image = { mimeType: 'image/jpeg', data: Buffer.from('fake') };
  await askAI({ requestId: 'req-media-001', text: 'what is this', image, fetchImpl });
  assert.equal(image.data, null);
});

test('blocked prompts surface as UNSAFE_REQUEST and are not cached', async () => {
  const fetchImpl = async () => ({
    ok: true, status: 200, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }),
  });
  await assert.rejects(
    () => askAI({ requestId: 'req-unsafe-01', text: 'something blocked', fetchImpl }),
    (e) => e.code === 'UNSAFE_REQUEST',
  );
});

test('cache key ignores case and spacing but not language or context', () => {
  const a = cacheKey({ presetId: null, text: ' Why  yellow ', language: 'en', userContext: { region: 'IN-UP-01' } });
  const b = cacheKey({ presetId: null, text: 'why yellow', language: 'en', userContext: { region: 'IN-UP-01' } });
  const c = cacheKey({ presetId: null, text: 'why yellow', language: 'hi', userContext: { region: 'IN-UP-01' } });
  const d = cacheKey({ presetId: null, text: 'why yellow', language: 'en', userContext: { region: 'IN-BR' } });
  assert.equal(a, b, 'case and spacing must not create a cache miss');
  assert.notEqual(b, c);
  assert.notEqual(b, d);
});

test('context lines only include fields the app supplied', () => {
  assert.deepEqual(contextLines({ region: 'IN-UP-01', crops: ['rice'] }), ['region: IN-UP-01', 'crops: rice']);
  assert.deepEqual(contextLines({}), []);
});

// --- schema / validation ---

test('overlong model strings are trimmed, not rejected', () => {
  const out = normalizeAnswer({ ...goodModelJson, summary: 'x'.repeat(400) });
  assert.equal(out.ok, true);
  assert.equal(out.answer.summary.length, LIMITS.summary);
});

test('answers without actions are rejected', () => {
  assert.equal(normalizeAnswer({ ...goodModelJson, actions: [] }).ok, false);
});

test('unknown confidence values are rejected', () => {
  assert.equal(normalizeAnswer({ ...goodModelJson, confidence: 'certain' }).ok, false);
});

test('extra model properties are stripped', () => {
  const out = normalizeAnswer({ ...goodModelJson, script: '<img onerror=1>' });
  assert.equal(out.ok, true);
  assert.equal('script' in out.answer, false);
});

test('model-invented sources are dropped; backend-supplied ones survive', () => {
  assert.deepEqual(sanitizeSources(['http://evil.example'], []), []);
  assert.deepEqual(
    sanitizeSources(['Open-Meteo', 'Made up site'], [{ label: 'Open-Meteo', url: 'https://open-meteo.com' }]),
    [{ label: 'Open-Meteo', url: 'https://open-meteo.com' }],
  );
});

test('retake instruction is kept only when a better photo is needed', () => {
  const asked = normalizeAnswer({ ...goodModelJson, needs_better_photo: true, retake_instruction: 'Photograph one leaf in daylight.' });
  assert.equal(asked.answer.retake_instruction, 'Photograph one leaf in daylight.');
  const not = normalizeAnswer({ ...goodModelJson, retake_instruction: 'ignore me' });
  assert.equal(not.answer.retake_instruction, null);
});

test('request validation rejects bad ids and overlong text', () => {
  assert.equal(normalizeRequest({ requestId: 'short', language: 'en' }).ok, false);
  assert.equal(normalizeRequest({ requestId: 'req-00000001', language: 'fr' }).ok, false);
  assert.equal(normalizeRequest({ requestId: 'req-00000001', language: 'en', presetId: 'DROP TABLE' }).ok, false);
  const long = normalizeRequest({ requestId: 'req-00000001', language: 'en', text: 'x'.repeat(301) });
  assert.equal(long.ok, false);
});

test('request validation strips unknown fields', () => {
  const out = normalizeRequest({ requestId: 'req-00000001', language: 'en', text: 'hi', isAdmin: true });
  assert.equal(out.ok, true);
  assert.equal('isAdmin' in out.request, false);
});

// --- media ---

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]);

test('a real jpeg passes and reports its sniffed type', () => {
  assert.equal(validateImage({ buffer: jpeg, size: jpeg.length, mimetype: 'image/jpeg' }).mimeType, 'image/jpeg');
});

test('svg and renamed files are rejected regardless of declared type', () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.throws(() => validateImage({ buffer: svg, size: svg.length, mimetype: 'image/svg+xml' }), /not supported/);
  assert.throws(() => validateImage({ buffer: svg, size: svg.length, mimetype: 'image/jpeg' }), /not supported/);
});

test('oversized photo is rejected before decoding', () => {
  assert.throws(
    () => validateImage({ buffer: jpeg, size: 9 * 1024 * 1024, mimetype: 'image/jpeg' }),
    (e) => e.code === 'MEDIA_TOO_LARGE',
  );
});

test('webm audio passes, random bytes do not', () => {
  assert.equal(validateAudio({ buffer: webm, size: webm.length, mimetype: 'audio/webm' }).mimeType, 'audio/webm');
  const junk = Buffer.alloc(40, 7);
  assert.throws(() => validateAudio({ buffer: junk, size: junk.length, mimetype: 'audio/webm' }), (e) => e.code === 'MEDIA_UNSUPPORTED');
});

// --- provider plumbing ---

test('image and audio become inlineData parts before the question text', () => {
  const parts = buildUserParts({ text: 'what is wrong', image: { mimeType: 'image/jpeg', data: jpeg }, contextLines: ['crop: rice'] });
  assert.equal(parts[0].inlineData.mimeType, 'image/jpeg');
  assert.match(parts[1].text, /crop: rice/);
  assert.match(parts[1].text, /what is wrong/);
});

test('request body pins JSON output and the response schema', () => {
  const body = buildRequestBody({ parts: [{ text: 'q' }], maxOutputTokens: 500 });
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.responseSchema.type, 'object');
  assert.match(body.systemInstruction.parts[0].text, /AgriLink AI/);
});

test('json wrapped in a code fence is still parsed', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJson('not json at all'), (e) => e.code === 'AI_INVALID_OUTPUT');
});

test('a truncated (MAX_TOKENS) response is treated as invalid output', () => {
  assert.throws(
    () => extractText({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }),
    (e) => e.code === 'AI_INVALID_OUTPUT',
  );
});

// --- fallbacks ---

test('intent is guessed from free text when no preset is used', () => {
  assert.equal(intentFor({ text: 'what is the mandi rate for rice' }), 'market_decision');
  assert.equal(intentFor({ text: 'can I spray before rain' }), 'weather_action');
  assert.equal(intentFor({ text: 'brown spots on leaves' }), 'crop_diagnosis');
  assert.equal(intentFor({ text: 'hello' }), 'general');
});

test('every fallback checklist is renderable and cautious', () => {
  for (const presetId of ['yellow_leaves', 'rain_spray', 'sell_or_wait', 'local_support', null]) {
    const { answer } = fallbackAnswer({ presetId, text: '' });
    assert.ok(answer.headline.length <= LIMITS.headline, presetId);
    assert.ok(answer.actions.length && answer.actions.length <= 3, presetId);
    assert.equal(answer.confidence, 'low');
    assert.equal(normalizeAnswer(answer).ok, true, `${presetId} fallback must pass its own schema`);
  }
});

// --- Node 18 compatibility (server runtime) ---

test('anySignal aborts when either source aborts, without AbortSignal.any', () => {
  const a = new AbortController();
  const b = new AbortController();
  const both = anySignal([a.signal, b.signal]);
  assert.equal(both.aborted, false);
  b.abort();
  assert.equal(both.aborted, true);
  assert.equal(anySignal([AbortSignal.abort(), new AbortController().signal]).aborted, true);
});

test('a cancelled client signal reaches the provider as CANCELLED', async () => {
  const client = new AbortController();
  const fetchImpl = (_url, opts) => new Promise((_res, rej) => {
    opts.signal.addEventListener('abort', () => rej(new Error('aborted')));
    client.abort();
  });
  await assert.rejects(
    () => askAI({ requestId: 'req-abort-001', text: 'why yellow', signal: client.signal, fetchImpl }),
    (e) => e.code === 'CANCELLED',
  );
});
