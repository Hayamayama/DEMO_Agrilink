import translate from 'google-translate-api-x';

export class TtsError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export const TTS_MAX_CHARS = 2000;
export const isConfigured = () => true;

/**
 * Translates text using google-translate-api-x and returns the text.
 * The frontend will then use the browser's native window.speechSynthesis to play it.
 */
export async function synthesize(text, language = 'en', { signal, provider = translate } = {}) {
  const trimmed = String(text || '').trim().slice(0, TTS_MAX_CHARS);
  if (!trimmed) throw new TtsError('TTS_EMPTY', 'No text to read aloud.');

  try {
    let textToSpeak = trimmed;

    if (language !== 'en') {
      const translation = await provider(trimmed, { to: language, requestOptions: { signal } });
      textToSpeak = translation.text;
    }

    return {
      text: textToSpeak,
      mimeType: 'text/plain',
    };
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) {
      throw new TtsError('CANCELLED', 'Cancelled.');
    }

    console.error('translate error:', err.message);

    if (err.message?.includes('TooManyRequests') || err.statusCode === 429) {
      throw new TtsError('TTS_RATE_LIMIT', 'Translation is busy. Try later.', { retryable: true });
    }

    throw new TtsError('TTS_UNAVAILABLE', 'Translation service error.', { retryable: true });
  }
}
