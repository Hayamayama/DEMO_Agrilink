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

test('TTS serves a repeated screen from its cache without synthesizing again', async () => {
  let calls = 0;
  const synthesize = async () => { calls += 1; return { text: 'translated text', mimeType: 'text/plain' }; };
  const app = express();
  app.use(express.json());
  app.use('/api/tts', ttsRouter({ auth, synthesize }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const post = (member, text) => realFetch(`http://127.0.0.1:${server.address().port}/api/tts`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `agrilink_session=${member}` },
    body: JSON.stringify({ text, language: 'en' }),
  });
  try {
    const text = `Market prices ${Date.now()}`;
    for (const member of ['member-1', 'member-2']) {
      const res = await post(member, text);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, text: 'translated text' });
    }
    assert.equal(calls, 1);
  } finally { server.closeAllConnections(); server.close(); }
});
