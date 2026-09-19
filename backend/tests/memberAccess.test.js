import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ttsRouter } from '../routes/tts.js';
import { aiRouter } from '../routes/ai.js';

// A stand-in auth service: the cookie value is the member id.
const auth = { session: async (token) => (token ? { id: token } : null) };

async function start() {
  const app = express();
  app.use(express.json());
  app.use('/api/tts', ttsRouter({ auth }));
  app.use('/api/ai', aiRouter({ auth }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, member) => realFetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(member ? { cookie: `agrilink_session=${member}` } : {}) },
    body: JSON.stringify(body),
  });
  return { post, close: () => { server.closeAllConnections(); server.close(); } };
}

const realFetch = globalThis.fetch;

test('Ask AI and TTS refuse anonymous callers', async () => {
  const t = await start();
  try {
    const tts = await t.post('/api/tts', { text: 'Hello' });
    assert.equal(tts.status, 401);
    assert.equal((await tts.json()).error.code, 'AUTH_REQUIRED');
    assert.equal((await t.post('/api/ai/ask', { requestId: 'req-anon-000001', presetId: 'yellow_leaves' })).status, 401);
  } finally { t.close(); }
});

test('TTS serves a repeated screen from its cache without calling Gemini again', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  let upstream = 0;
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('generativelanguage.googleapis.com')) return realFetch(url, init);
    upstream += 1;
    const data = Buffer.from('fake-audio').toString('base64');
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data } }] } }] }), { status: 200 });
  };
  const t = await start();
  try {
    const text = `Market prices ${Date.now()}`;
    const first = await t.post('/api/tts', { text, language: 'en' }, 'member-1');
    assert.equal(first.status, 200);
    assert.equal(Buffer.from(await first.arrayBuffer()).toString(), 'fake-audio');
    const second = await t.post('/api/tts', { text, language: 'en' }, 'member-2');
    assert.equal(second.status, 200);
    assert.equal(Buffer.from(await second.arrayBuffer()).toString(), 'fake-audio');
    assert.equal(upstream, 1);
  } finally {
    t.close();
    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevKey;
  }
});
