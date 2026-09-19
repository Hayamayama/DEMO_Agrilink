// Gemini REST client. Deliberately fetch-based rather than an SDK: it matches
// weatherService.js, keeps AbortController/timeout handling in one place, and
// makes the whole thing testable by injecting fetchImpl.
// The API key is read from the environment here and never leaves the server.
import { GEMINI_RESPONSE_SCHEMA } from './aiSchemas.js';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class AiError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export const config = () => ({
  apiKey: process.env.GEMINI_API_KEY || '',
  model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 12000,
  maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS) || 500,
});

export const isConfigured = () => Boolean(config().apiKey);

export const SYSTEM_INSTRUCTION = `You are AgriLink AI, a practical assistant for smallholder farmers using a
240x320 keypad phone. Give short, actionable, locally relevant guidance.

User context may include region, crops, weather, and market information.
Use only context explicitly provided by the application. Never invent a live
price, current weather value, government program, source URL, or certainty.

For crop images, describe visible observations and likely possibilities. Do not
claim definitive diagnosis. If image quality is insufficient, request one clear
retake. For chemical or pesticide topics, prioritize label instructions, local
regulations, protective equipment, and expert confirmation.

Return only JSON matching the supplied schema. Keep strings short enough for a
small screen. Use the requested language. Do not return markdown or HTML.`;

const LANGUAGE_NAME = { en: 'English', hi: 'Hindi' };

// Turn validated request pieces into the single user turn Gemini sees.
export function buildUserParts({ text, contextLines = [], image = null, audio = null, language = 'en' }) {
  const parts = [];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data.toString('base64') } });
  if (audio) parts.push({ inlineData: { mimeType: audio.mimeType, data: audio.data.toString('base64') } });
  const lines = [
    `Language for the answer: ${LANGUAGE_NAME[language] || 'English'}.`,
    contextLines.length ? `Application context (the only facts you may rely on):\n${contextLines.map((l) => `- ${l}`).join('\n')}` : 'Application context: none provided.',
    image ? 'A crop photo is attached. Describe visible observations only.' : '',
    `Farmer question: ${text || '(no text; use the attached media)'}`,
  ].filter(Boolean);
  parts.push({ text: lines.join('\n\n') });
  return parts;
}

export function buildRequestBody({ parts, history = [], maxOutputTokens, repairHint = null }) {
  const contents = [
    // Only the last four turns are kept; see aiAdapter.trimHistory.
    ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: 'user', parts },
  ];
  if (repairHint) {
    contents.push({
      role: 'user',
      parts: [{ text: `Your previous reply was rejected: ${repairHint}. Reply again with valid JSON only.` }],
    });
  }
  return {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA,
      maxOutputTokens,
      temperature: 0.4,
    },
  };
}

// Maps provider failures onto the stable error codes in the API contract.
// Provider message text is logged, never returned to the client.
function providerError(status, body) {
  if (status === 429) return new AiError('AI_RATE_LIMIT', 'AI is busy. Try again shortly.', { retryable: true });
  if (status === 400 && /API key/i.test(body)) return new AiError('AI_UNAVAILABLE', 'AI is not configured.');
  if (status >= 500) return new AiError('AI_UNAVAILABLE', 'AI service is unavailable.', { retryable: true });
  return new AiError('AI_UNAVAILABLE', 'AI service rejected the request.');
}

// AbortSignal.any needs Node 20.3+; the server runs Node 18, so combine by hand.
export function anySignal(signals) {
  const controller = new AbortController();
  const abort = (s) => () => controller.abort(s.reason);
  for (const s of signals) {
    if (s.aborted) { controller.abort(s.reason); break; }
    s.addEventListener('abort', abort(s), { once: true });
  }
  return controller.signal;
}

async function call(path, body, { signal, fetchImpl = fetch, timeoutMs }) {
  const { apiKey } = config();
  if (!apiKey) throw new AiError('AI_UNAVAILABLE', 'AI is not configured.');
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? anySignal([signal, timeout]) : timeout;
  let res;
  try {
    res = await fetchImpl(`${API_ROOT}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: combined,
    });
  } catch (err) {
    if (signal?.aborted) throw new AiError('CANCELLED', 'Cancelled.');
    throw new AiError('AI_TIMEOUT', 'AI is taking longer than usual.', { retryable: true });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`gemini ${res.status}: ${detail.slice(0, 200)}`); // detail never reaches the client
    throw providerError(res.status, detail);
  }
  return res.json();
}

export function extractText(data) {
  if (data?.promptFeedback?.blockReason) {
    throw new AiError('UNSAFE_REQUEST', 'This request cannot be answered.');
  }
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts || []).map((p) => p.text).filter(Boolean).join('');
  if (!text) {
    const reason = candidate?.finishReason || 'EMPTY';
    if (reason === 'SAFETY') throw new AiError('UNSAFE_REQUEST', 'This request cannot be answered.');
    throw new AiError('AI_INVALID_OUTPUT', 'AI returned an unusable answer.', { retryable: true });
  }
  return text;
}

export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Some models wrap JSON in a code fence despite responseMimeType.
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new AiError('AI_INVALID_OUTPUT', 'AI returned an unusable answer.', { retryable: true });
    try {
      return JSON.parse(m[0]);
    } catch {
      throw new AiError('AI_INVALID_OUTPUT', 'AI returned an unusable answer.', { retryable: true });
    }
  }
}

export async function generateAnswer(opts) {
  const { model, maxOutputTokens, timeoutMs } = config();
  const body = buildRequestBody({
    parts: buildUserParts(opts),
    history: opts.history,
    maxOutputTokens,
    repairHint: opts.repairHint,
  });
  const data = await call(`${model}:generateContent`, body, {
    signal: opts.signal,
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.timeoutMs ?? timeoutMs,
  });
  return { json: parseJson(extractText(data)), usage: data.usageMetadata || null };
}

// Voice: transcribe first, then run the normal text pipeline on the transcript,
// so the farmer can confirm what the phone heard.
export async function transcribeAudio({ audio, language = 'en', signal, fetchImpl, timeoutMs }) {
  const cfg = config();
  const body = {
    systemInstruction: {
      parts: [{ text: 'Transcribe the spoken question verbatim. Return only the transcript text, no commentary.' }],
    },
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: audio.mimeType, data: audio.data.toString('base64') } },
        { text: `The speaker is a farmer. Expected language: ${LANGUAGE_NAME[language] || 'English'}.` },
      ],
    }],
    generationConfig: { maxOutputTokens: 120, temperature: 0 },
  };
  const data = await call(`${cfg.model}:generateContent`, body, {
    signal,
    fetchImpl,
    timeoutMs: timeoutMs ?? cfg.timeoutMs,
  });
  return extractText(data).replace(/\s+/g, ' ').trim().slice(0, 300);
}
