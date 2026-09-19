import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { synthesize, TtsError, TTS_MAX_CHARS } from './ttsService.js';

describe('ttsService.synthesize', () => {
  it('returns English text without calling the translation provider', async () => {
    const provider = mock.fn();
    const result = await synthesize('Hello world', 'en', { provider });
    assert.deepEqual(result, { text: 'Hello world', mimeType: 'text/plain' });
    assert.equal(provider.mock.calls.length, 0);
  });

  it('translates non-English text through the injected provider', async () => {
    const provider = mock.fn(async () => ({ text: 'नमस्ते' }));
    const result = await synthesize('Hello', 'hi', { provider });
    assert.equal(result.text, 'नमस्ते');
    assert.equal(provider.mock.calls[0].arguments[1].to, 'hi');
  });

  it('throws TTS_EMPTY for blank text', async () => {
    await assert.rejects(() => synthesize('   '), { code: 'TTS_EMPTY' });
  });

  it('truncates text to TTS_MAX_CHARS', async () => {
    const result = await synthesize('a'.repeat(TTS_MAX_CHARS + 500));
    assert.equal(result.text.length, TTS_MAX_CHARS);
  });

  it('throws TTS_RATE_LIMIT when the provider is throttled', async () => {
    const provider = mock.fn(async () => { throw Object.assign(new Error('TooManyRequests'), { statusCode: 429 }); });
    await assert.rejects(() => synthesize('hello', 'hi', { provider }), (err) => {
      assert.ok(err instanceof TtsError);
      assert.equal(err.code, 'TTS_RATE_LIMIT');
      assert.ok(err.retryable);
      return true;
    });
  });

  it('throws TTS_UNAVAILABLE on provider failure', async () => {
    const provider = mock.fn(async () => { throw new Error('network down'); });
    await assert.rejects(() => synthesize('hello', 'hi', { provider }), { code: 'TTS_UNAVAILABLE' });
  });

  it('throws CANCELLED when the caller aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = mock.fn(async () => { throw new DOMException('aborted', 'AbortError'); });
    await assert.rejects(() => synthesize('hello', 'hi', { signal: controller.signal, provider }), { code: 'CANCELLED' });
  });
});
