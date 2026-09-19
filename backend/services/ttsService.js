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
export async function synthesize(text, language = 'en', { signal } = {}) {
  const trimmed = String(text || '').trim().slice(0, TTS_MAX_CHARS);
  if (!trimmed) throw new TtsError('TTS_EMPTY', 'No text to read aloud.');

  try {
    let textToSpeak = trimmed;
    
    // 1. Translate if needed
    if (language !== 'en') {
      const translation = await translate(trimmed, { to: language, requestOptions: { signal } });
      textToSpeak = translation.text;
    }

    // 2. Return the translated string instead of an MP3 Buffer
    return {
      text: textToSpeak,
      mimeType: 'text/plain', // Handled by route differently now
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
