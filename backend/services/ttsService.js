import translate from 'google-translate-api-x';

export class TtsError extends Error {
  constructor(code, message, { retryable = false, fallbackText = null } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.fallbackText = fallbackText;
  }
}

export const TTS_MAX_CHARS = 2000;
export const isConfigured = () => true; // Native handset speech remains a usable final fallback.

function config({ apiKey, model, timeoutMs } = {}) {
  return {
    apiKey: apiKey ?? process.env.GEMINI_API_KEY ?? '',
    model: model ?? process.env.TTS_MODEL ?? 'gemini-1.5-flash-8b',
    timeoutMs: timeoutMs ?? (Number(process.env.TTS_TIMEOUT_MS) || 15_000),
  };
}

function chunkText(text, maxLen = 190) {
  const chunks = [];
  let current = '';
  for (const part of text.split(/([\s.,;!?]+)/)) {
    if (current.length + part.length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = part;
    } else current += part;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function cancelled(signal, err) {
  return signal?.aborted || err?.name === 'AbortError';
}

async function synthesizeWithGemini(text, language, signal, { fetchImpl = fetch, ...options } = {}) {
  const cfg = config(options);
  if (!cfg.apiKey) throw new TtsError('TTS_UNAVAILABLE', 'Gemini TTS is not configured.', { retryable: true });

  const timeout = AbortSignal.timeout(cfg.timeoutMs);
  const combined = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : (signal || timeout);
  let res;
  try {
    res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `Please read the following aloud clearly and naturally in the appropriate language:\n\n${text}` }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
      }),
      signal: combined,
    });
  } catch (err) {
    if (cancelled(signal, err)) throw new TtsError('CANCELLED', 'Cancelled.');
    throw new TtsError('TTS_TIMEOUT', 'Gemini TTS is taking too long.', { retryable: true });
  }
  if (!res.ok) {
    if (res.status === 429) throw new TtsError('TTS_RATE_LIMIT', 'Gemini TTS is busy. Try later.', { retryable: true });
    throw new TtsError('TTS_UNAVAILABLE', 'Gemini TTS is unavailable.', { retryable: true });
  }
  const data = await res.json();
  const audioPart = data?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.mimeType?.startsWith('audio/'));
  if (!audioPart) throw new TtsError('TTS_NO_AUDIO', 'Gemini TTS returned no audio.', { retryable: true });
  return { audio: Buffer.from(audioPart.inlineData.data, 'base64'), mimeType: audioPart.inlineData.mimeType };
}

/**
 * Cloud audio is preferred for voice quality. If both providers fail, return translated text so
 * the handset can still read it with speechSynthesis instead of leaving the farmer with silence.
 */
export async function synthesize(text, language = 'en', {
  signal,
  translateImpl = translate,
  speakImpl = translate.speak,
  fetchImpl = fetch,
  apiKey,
  model,
  timeoutMs,
} = {}) {
  const trimmed = String(text || '').trim().slice(0, TTS_MAX_CHARS);
  if (!trimmed) throw new TtsError('TTS_EMPTY', 'No text to read aloud.');

  let translatedText = trimmed;
  if (language !== 'en') {
    try {
      translatedText = (await translateImpl(trimmed, { to: language, requestOptions: { signal } })).text;
    } catch (err) {
      if (cancelled(signal, err)) throw new TtsError('CANCELLED', 'Cancelled.');
      throw new TtsError('TTS_UNAVAILABLE', 'Translation is unavailable.', { retryable: true });
    }
  }

  try {
    const chunks = chunkText(translatedText);
    const base64Audio = await speakImpl(chunks, { to: language, requestOptions: { signal } });
    const buffers = (Array.isArray(base64Audio) ? base64Audio : [base64Audio]).filter(Boolean).map((value) => Buffer.from(value, 'base64'));
    if (!buffers.length) throw new Error('Google TTS returned no audio.');
    return { audio: Buffer.concat(buffers), mimeType: 'audio/mp3' };
  } catch (googleError) {
    if (cancelled(signal, googleError)) throw new TtsError('CANCELLED', 'Cancelled.');
    try {
      return await synthesizeWithGemini(translatedText, language, signal, { fetchImpl, apiKey, model, timeoutMs });
    } catch (geminiError) {
      if (cancelled(signal, geminiError)) throw new TtsError('CANCELLED', 'Cancelled.');
      console.warn(`TTS cloud audio unavailable: Google: ${googleError.message}; Gemini: ${geminiError.message}`);
      throw new TtsError('TTS_FALLBACK_NATIVE', 'Cloud audio is unavailable. Reading on this phone instead.', {
        retryable: true,
        fallbackText: translatedText,
      });
    }
  }
}
