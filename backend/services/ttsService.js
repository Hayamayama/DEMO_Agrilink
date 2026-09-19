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

// Helper to chunk text by word/punctuation so it stays under 200 chars for TTS
function chunkText(text, maxLen = 190) {
  const chunks = [];
  let current = '';
  // Split by whitespace or punctuation roughly
  const words = text.split(/([\s.,;!?]+)/);
  
  for (const part of words) {
    if (current.length + part.length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = part;
    } else {
      current += part;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c);
}

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

    // 2. Chunk text to respect the 200 char limit of Google Translate's TTS endpoint
    const chunks = chunkText(textToSpeak);
    if (chunks.length === 0) throw new TtsError('TTS_EMPTY', 'No text to read aloud.');

    // 3. Generate speech audio for all chunks
    const base64Array = await translate.speak(chunks, { to: language, requestOptions: { signal } });
    
    // 4. Concatenate MP3 Buffers
    const buffers = (Array.isArray(base64Array) ? base64Array : [base64Array])
      .filter(b64 => b64)
      .map(b64 => Buffer.from(b64, 'base64'));

    if (buffers.length === 0) {
      throw new TtsError('TTS_NO_AUDIO', 'TTS did not return audio.', { retryable: true });
    }

    return {
      audio: Buffer.concat(buffers),
      mimeType: 'audio/mp3',
    };
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) {
      throw new TtsError('CANCELLED', 'Cancelled.');
    }
    
    console.error('tts error:', err.message);
    
    if (err.message?.includes('TooManyRequests') || err.statusCode === 429) {
      throw new TtsError('TTS_RATE_LIMIT', 'TTS is busy. Try later.', { retryable: true });
    }
    
    throw new TtsError('TTS_UNAVAILABLE', 'TTS service error.', { retryable: true });
  }
}
