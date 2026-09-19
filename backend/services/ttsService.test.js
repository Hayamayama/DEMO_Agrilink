import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { synthesize, TtsError, TTS_MAX_CHARS } from './ttsService.js';

// Back up and restore env around every test.
const origKey = process.env.GEMINI_API_KEY;
beforeEach(() => { process.env.GEMINI_API_KEY = 'test-key'; });

function fakeResponse(parts, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      candidates: [{ content: { parts } }],
    }),
    text: async () => 'error body',
  };
}

describe('ttsService.synthesize', () => {
  it('returns audio buffer on success', async () => {
    const audioB64 = Buffer.from('fake-audio-data').toString('base64');
    const fetchImpl = mock.fn(async () => fakeResponse([
      { inlineData: { mimeType: 'audio/L16;rate=24000', data: audioB64 } },
    ]));

    const result = await synthesize('Hello world', 'en', { fetchImpl });
    assert.ok(Buffer.isBuffer(result.audio));
    assert.equal(result.audio.toString(), 'fake-audio-data');
    assert.equal(result.mimeType, 'audio/L16;rate=24000');
    assert.equal(fetchImpl.mock.calls.length, 1);
  });

  it('throws TTS_UNAVAILABLE when API key is missing', async () => {
    process.env.GEMINI_API_KEY = '';
    await assert.rejects(() => synthesize('hello'), (err) => {
      assert.ok(err instanceof TtsError);
      assert.equal(err.code, 'TTS_UNAVAILABLE');
      return true;
    });
  });

  it('throws TTS_EMPTY for blank text', async () => {
    await assert.rejects(() => synthesize('   '), (err) => {
      assert.equal(err.code, 'TTS_EMPTY');
      return true;
    });
  });

  it('truncates text to TTS_MAX_CHARS', async () => {
    const longText = 'a'.repeat(TTS_MAX_CHARS + 500);
    const audioB64 = Buffer.from('ok').toString('base64');
    const fetchImpl = mock.fn(async (_url, opts) => {
      const body = JSON.parse(opts.body);
      const sent = body.contents[0].parts[0].text;
      // The text in the prompt should not exceed TTS_MAX_CHARS (plus the instruction prefix).
      assert.ok(sent.length <= TTS_MAX_CHARS + 200, 'text was not truncated');
      return fakeResponse([{ inlineData: { mimeType: 'audio/L16;rate=24000', data: audioB64 } }]);
    });

    await synthesize(longText, 'en', { fetchImpl });
    assert.equal(fetchImpl.mock.calls.length, 1);
  });

  it('throws TTS_RATE_LIMIT on 429', async () => {
    const fetchImpl = mock.fn(async () => ({ ok: false, status: 429, text: async () => 'rate limited' }));
    await assert.rejects(() => synthesize('hi', 'en', { fetchImpl }), (err) => {
      assert.equal(err.code, 'TTS_RATE_LIMIT');
      assert.ok(err.retryable);
      return true;
    });
  });

  it('throws TTS_TIMEOUT on fetch failure', async () => {
    const fetchImpl = mock.fn(async () => { throw new Error('network down'); });
    await assert.rejects(() => synthesize('hi', 'en', { fetchImpl }), (err) => {
      assert.equal(err.code, 'TTS_TIMEOUT');
      return true;
    });
  });

  it('throws TTS_NO_AUDIO when response has no audio part', async () => {
    const fetchImpl = mock.fn(async () => fakeResponse([{ text: 'no audio here' }]));
    await assert.rejects(() => synthesize('hi', 'en', { fetchImpl }), (err) => {
      assert.equal(err.code, 'TTS_NO_AUDIO');
      return true;
    });
  });
});
