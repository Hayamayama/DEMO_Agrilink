import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesize, TtsError } from './ttsService.js';

const mp3 = Buffer.from('ID3 test audio').toString('base64');

test('TTS returns Google MP3 without calling Gemini', async () => {
  let geminiCalls = 0;
  const result = await synthesize('Market prices', 'en', {
    speakImpl: async () => [mp3],
    fetchImpl: async () => { geminiCalls += 1; throw new Error('Gemini must not run'); },
  });
  assert.equal(result.mimeType, 'audio/mp3');
  assert.deepEqual(result.audio, Buffer.from('ID3 test audio'));
  assert.equal(geminiCalls, 0);
});

test('TTS falls back from Google audio to Gemini audio', async () => {
  const result = await synthesize('Market prices', 'en', {
    speakImpl: async () => { throw new Error('Google blocked'); },
    apiKey: 'test-key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: mp3 } }] } }] }),
    }),
  });
  assert.equal(result.mimeType, 'audio/wav');
  assert.deepEqual(result.audio, Buffer.from('ID3 test audio'));
});

test('TTS returns translated text for handset speech when cloud audio is unavailable', async () => {
  await assert.rejects(
    synthesize('Market prices', 'hi', {
      translateImpl: async () => ({ text: 'बाज़ार भाव' }),
      speakImpl: async () => { throw new Error('Google blocked'); },
      apiKey: 'test-key',
      fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    }),
    (err) => err instanceof TtsError
      && err.code === 'TTS_FALLBACK_NATIVE'
      && err.fallbackText === 'बाज़ार भाव',
  );
});

test('TTS cancellation does not fall back and spend another provider request', async () => {
  const controller = new AbortController();
  controller.abort();
  let geminiCalls = 0;
  await assert.rejects(
    synthesize('Market prices', 'en', {
      signal: controller.signal,
      speakImpl: async () => { const err = new Error('aborted'); err.name = 'AbortError'; throw err; },
      fetchImpl: async () => { geminiCalls += 1; return { ok: false, status: 500, json: async () => ({}) }; },
    }),
    (err) => err instanceof TtsError && err.code === 'CANCELLED',
  );
  assert.equal(geminiCalls, 0);
});
