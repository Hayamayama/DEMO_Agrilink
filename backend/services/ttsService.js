// Gemini-based Text-to-Speech synthesis service.
// Uses the Gemini REST API to generate speech audio from text, so we reuse the
// existing GEMINI_API_KEY without any new billing or service setup.

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class TtsError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export const TTS_MAX_CHARS = Number(process.env.TTS_MAX_CHARS) || 2000;

const config = () => ({
  apiKey: process.env.GEMINI_API_KEY || '',
  model: process.env.TTS_MODEL || 'gemini-2.5-flash-preview-tts',
  timeoutMs: Number(process.env.TTS_TIMEOUT_MS) || 15000,
});

// Map our app language codes to Gemini TTS voice names.
// Kore = neutral English, Aoede = warm/clear; we pick voices that cover the
// target languages well on the multimodal endpoint.
const VOICE_MAP = {
  en: 'Kore',
  hi: 'Kore',
  bn: 'Kore',
  vi: 'Kore',
};

export const isConfigured = () => Boolean(config().apiKey);

/**
 * Synthesise speech from text using Gemini's multimodal generateContent with
 * audio output.  Returns { audio: Buffer, mimeType: 'audio/mp3' }.
 *
 * @param {string}  text        The text to speak (will be truncated to TTS_MAX_CHARS).
 * @param {string}  language    ISO language code: en, hi, bn, vi.
 * @param {object}  opts
 * @param {AbortSignal} [opts.signal]     Caller abort signal (e.g. client disconnected).
 * @param {Function}    [opts.fetchImpl]  Replaceable fetch for testing.
 */
export async function synthesize(text, language = 'en', { signal, fetchImpl = fetch } = {}) {
  const cfg = config();
  if (!cfg.apiKey) throw new TtsError('TTS_UNAVAILABLE', 'TTS is not configured.');

  const trimmed = String(text || '').trim().slice(0, TTS_MAX_CHARS);
  if (!trimmed) throw new TtsError('TTS_EMPTY', 'No text to read aloud.');

  const voice = VOICE_MAP[language] || VOICE_MAP.en;

  // Build the Gemini request for audio generation.
  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: `Please read the following aloud clearly and naturally in the appropriate language:\n\n${trimmed}` }],
    }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  };

  const url = `${API_ROOT}/${cfg.model}:generateContent?key=${cfg.apiKey}`;
  const timeout = AbortSignal.timeout(cfg.timeoutMs);
  const combined = signal
    ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout)
    : timeout;

  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: combined,
    });
  } catch (err) {
    if (signal?.aborted) throw new TtsError('CANCELLED', 'Cancelled.');
    throw new TtsError('TTS_TIMEOUT', 'TTS is taking too long.', { retryable: true });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`tts ${res.status}: ${detail.slice(0, 200)}`);
    if (res.status === 429) throw new TtsError('TTS_RATE_LIMIT', 'TTS is busy. Try later.', { retryable: true });
    throw new TtsError('TTS_UNAVAILABLE', 'TTS service error.', { retryable: res.status >= 500 });
  }

  const data = await res.json();

  // Extract inline audio data from the Gemini response.
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const audioPart = parts.find((p) => p.inlineData?.mimeType?.startsWith('audio/'));

  if (!audioPart) {
    console.error('tts: no audio part in response', JSON.stringify(data).slice(0, 300));
    throw new TtsError('TTS_NO_AUDIO', 'TTS did not return audio.', { retryable: true });
  }

  return {
    audio: Buffer.from(audioPart.inlineData.data, 'base64'),
    mimeType: audioPart.inlineData.mimeType,
  };
}
