import translate from 'google-translate-api-x';

export class TtsError extends Error {
  constructor(code, message, originalError = null) {
    super(message);
    this.code = code;
    this.originalError = originalError;
  }
}

export const TTS_MAX_CHARS = 2000;

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

async function synthesizeWithGemini(text, language, signal) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  const model = process.env.TTS_MODEL || 'gemini-1.5-flash-8b';
  
  if (!apiKey) throw new TtsError('ERR_GEMINI_AUDIO_FAILED', 'Gemini API Key is missing.');

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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const timeout = AbortSignal.timeout(15000);
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
    if (signal?.aborted) throw new TtsError('ERR_CANCELLED', 'Cancelled.');
    throw new TtsError('ERR_GEMINI_AUDIO_FAILED', 'Gemini API fetch failed or timed out.', err);
  }

  if (!res.ok) {
    throw new TtsError('ERR_GEMINI_AUDIO_FAILED', `Gemini API returned status ${res.status}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const audioPart = candidate?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));

  if (!audioPart) {
    throw new TtsError('ERR_GEMINI_AUDIO_FAILED', 'Gemini did not return audio inlineData.');
  }

  return {
    audio: Buffer.from(audioPart.inlineData.data, 'base64'),
    mimeType: audioPart.inlineData.mimeType,
  };
}

export async function synthesize(text, language = 'en', { signal } = {}) {
  const trimmed = String(text || '').trim().slice(0, TTS_MAX_CHARS);
  if (!trimmed) throw new TtsError('ERR_NO_TEXT', 'No text provided for TTS.');

  // Step 1: Translate the text using Google Translate API
  let translatedText = trimmed;
  if (language !== 'en') {
    try {
      const translation = await translate(trimmed, { to: language, requestOptions: { signal } });
      translatedText = translation.text;
    } catch (err) {
      if (err.name === 'AbortError' || signal?.aborted) throw new TtsError('ERR_CANCELLED', 'Cancelled.');
      throw new TtsError('ERR_TRANSLATE_FAILED', 'Failed to translate text via Google API.', err);
    }
  }

  // Step 2: Try to get audio from Google Translate API
  try {
    const chunks = chunkText(translatedText);
    if (chunks.length === 0) throw new TtsError('ERR_NO_TEXT', 'Text became empty after chunking.');

    const base64Array = await translate.speak(chunks, { to: language, requestOptions: { signal } });
    
    const buffers = (Array.isArray(base64Array) ? base64Array : [base64Array])
      .filter(b64 => b64)
      .map(b64 => Buffer.from(b64, 'base64'));

    if (buffers.length === 0) throw new Error('Google speak returned empty array.');

    return { audio: Buffer.concat(buffers), mimeType: 'audio/mp3' };
    
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) throw new TtsError('ERR_CANCELLED', 'Cancelled.');
    console.warn(`Step 2 Failed (Google Audio): ${err.message}. Moving to Step 3 (Gemini).`);
    
    // Step 3: Try to get audio from Gemini API using the translated text
    return await synthesizeWithGemini(translatedText, language, signal);
  }
}
