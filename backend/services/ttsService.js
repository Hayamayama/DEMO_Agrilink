import translate from 'google-translate-api-x';

export class TtsError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export const TTS_MAX_CHARS = 2000;

const config = () => ({
  apiKey: process.env.GEMINI_API_KEY || '',
  model: process.env.TTS_MODEL || 'gemini-1.5-flash-8b',
  timeoutMs: Number(process.env.TTS_TIMEOUT_MS) || 15000,
});

export const isConfigured = () => true;

// Helper to chunk text by word/punctuation so it stays under 200 chars for Google Translate TTS
function chunkText(text, maxLen = 190) {
  const chunks = [];
  let current = '';
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

// Fallback method using Gemini Official API if the scraper fails
async function synthesizeWithGemini(text, language, signal) {
  const cfg = config();
  if (!cfg.apiKey) throw new TtsError('TTS_UNAVAILABLE', 'TTS fallback is not configured.');

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: `Please read the following aloud clearly and naturally in the appropriate language:\n\n${text}` }],
    }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
  const timeout = AbortSignal.timeout(cfg.timeoutMs);
  const combined = signal ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout) : timeout;

  let res;
  try {
    res = await fetch(url, {
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
    if (res.status === 429) throw new TtsError('TTS_RATE_LIMIT', 'TTS is busy. Try later.', { retryable: true });
    throw new TtsError('TTS_UNAVAILABLE', 'TTS service error.', { retryable: true });
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const audioPart = candidate?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));

  if (!audioPart) throw new TtsError('TTS_NO_AUDIO', 'TTS did not return audio.', { retryable: true });

  return {
    audio: Buffer.from(audioPart.inlineData.data, 'base64'),
    mimeType: audioPart.inlineData.mimeType,
  };
}

export async function synthesize(text, language = 'en', { signal } = {}) {
  const trimmed = String(text || '').trim().slice(0, TTS_MAX_CHARS);
  if (!trimmed) throw new TtsError('TTS_EMPTY', 'No text to read aloud.');

  try {
    // PRIMARY METHOD: Free Google Translate MP3 Generation
    let textToSpeak = trimmed;
    if (language !== 'en') {
      const translation = await translate(trimmed, { to: language, requestOptions: { signal } });
      textToSpeak = translation.text;
    }

    const chunks = chunkText(textToSpeak);
    if (chunks.length === 0) throw new TtsError('TTS_EMPTY', 'No text to read aloud.');

    const base64Array = await translate.speak(chunks, { to: language, requestOptions: { signal } });
    
    const buffers = (Array.isArray(base64Array) ? base64Array : [base64Array])
      .filter(b64 => b64)
      .map(b64 => Buffer.from(b64, 'base64'));

    if (buffers.length === 0) throw new Error('TTS did not return audio.');

    return { audio: Buffer.concat(buffers), mimeType: 'audio/mp3' };
    
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) throw new TtsError('CANCELLED', 'Cancelled.');
    
    console.warn(`Primary TTS (Google Translate) failed: ${err.message}. Falling back to Gemini API...`);
    
    // FALLBACK METHOD: Gemini API
    try {
      return await synthesizeWithGemini(trimmed, language, signal);
    } catch (fallbackErr) {
      if (fallbackErr instanceof TtsError) throw fallbackErr;
      throw new TtsError('TTS_UNAVAILABLE', 'Both TTS services failed.', { retryable: true });
    }
  }
}
