// Orchestration for Ask AI: context building, idempotency, cache, conversation
// memory, one repair attempt, and a deterministic fallback so the UI never sees
// a blank screen or a raw provider error.
import crypto from 'node:crypto';
import { AiError, generateAnswer, transcribeAudio, isConfigured } from './geminiProvider.js';
import { normalizeAnswer } from './aiSchemas.js';
import { fallbackAnswer, intentFor } from './aiFallbacks.js';
import { presetById } from './aiPresets.js';

const CACHE_TTL_MS = () => (Number(process.env.AI_CACHE_TTL_SECONDS) || 600) * 1000;
const IDEMPOTENCY_TTL_MS = 2 * 60 * 1000;
const CONVERSATION_TTL_MS = 30 * 60 * 1000;
const MAX_HISTORY_TURNS = 4; // cost control: only the last four turns go to the model

const cache = new Map();          // cacheKey -> { at, payload }
const inFlight = new Map();       // requestId -> Promise
const recent = new Map();         // requestId -> { at, payload }
const conversations = new Map();  // conversationId -> { at, turns: [{role, text}] }

function sweep(map, ttl) {
  const now = Date.now();
  for (const [k, v] of map) if (now - v.at > ttl) map.delete(k);
}

export function contextLines(userContext = {}) {
  const lines = [];
  if (userContext.region) lines.push(`region: ${userContext.region}`);
  if (userContext.crops?.length) lines.push(`crops: ${userContext.crops.join(', ')}`);
  if (userContext.market) lines.push(`nearest market: ${userContext.market}`);
  if (userContext.experienceLevel) lines.push(`farmer: ${userContext.experienceLevel}`);
  return lines.slice(0, 4);
}

export function cacheKey({ presetId, text, language, userContext }) {
  const normalized = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const basis = JSON.stringify([presetId || '', normalized, language, contextLines(userContext)]);
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 24);
}

export function trimHistory(turns = []) {
  return turns.slice(-MAX_HISTORY_TURNS);
}

function getConversation(id) {
  sweep(conversations, CONVERSATION_TTL_MS);
  if (!id) return null;
  return conversations.get(id) || null;
}

function rememberTurn(id, question, answer) {
  const conv = conversations.get(id) || { at: Date.now(), turns: [] };
  conv.at = Date.now();
  conv.turns.push({ role: 'user', text: question.slice(0, 300) });
  conv.turns.push({ role: 'model', text: `${answer.headline}. ${answer.summary}`.slice(0, 300) });
  conv.turns = conv.turns.slice(-MAX_HISTORY_TURNS * 2);
  conversations.set(id, conv);
}

const newConversationId = () => `conv_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

/**
 * Single entry point used by routes/ai.js.
 * Always resolves with a client-ready payload, or throws AiError for input
 * problems the client must fix (unsafe/invalid request).
 */
export async function askAI({
  requestId,
  conversationId = null,
  presetId = null,
  text = '',
  image = null,
  audio = null,
  language = 'en',
  userContext = {},
  signal,
  fetchImpl,
  now = Date.now,
} = {}) {
  sweep(recent, IDEMPOTENCY_TTL_MS);
  const replay = recent.get(requestId);
  if (replay) return { ...replay.payload, meta: { ...replay.payload.meta, cached: true } };
  if (inFlight.has(requestId)) return inFlight.get(requestId);

  const run = execute({ requestId, conversationId, presetId, text, image, audio, language, userContext, signal, fetchImpl, now })
    .then((payload) => {
      recent.set(requestId, { at: now(), payload });
      return payload;
    })
    .finally(() => {
      inFlight.delete(requestId);
      // Media buffers are dropped as soon as the request is done.
      if (image) image.data = null;
      if (audio) audio.data = null;
    });
  inFlight.set(requestId, run);
  return run;
}

async function execute({ requestId, conversationId, presetId, text, image, audio, language, userContext, signal, fetchImpl, now }) {
  const startedAt = now();
  const preset = presetById(presetId);
  let question = (preset?.text || text || '').trim();
  let transcript = null;
  const lines = contextLines(userContext);

  if (audio) {
    if (!isConfigured()) throw new AiError('AI_UNAVAILABLE', 'AI is not configured.');
    transcript = await transcribeAudio({ audio, language, signal, fetchImpl });
    if (!transcript) throw new AiError('INVALID_INPUT', 'Could not hear the question. Try again.');
    question = [question, transcript].filter(Boolean).join(' ').slice(0, 300);
  }
  if (!question && !image) throw new AiError('INVALID_INPUT', 'Ask a question or attach a photo.');

  const conv = getConversation(conversationId);
  const key = !image && !audio && !conv ? cacheKey({ presetId, text: question, language, userContext }) : null;
  if (key) {
    sweep(cache, CACHE_TTL_MS());
    const hit = cache.get(key);
    if (hit) {
      return {
        ...hit.payload,
        requestId,
        transcript,
        meta: { ...hit.payload.meta, cached: true, latencyMs: now() - startedAt },
      };
    }
  }

  const askOnce = (repairHint) => generateAnswer({
    text: question,
    contextLines: lines,
    image,
    audio: null, // audio already became `transcript`
    language,
    history: trimHistory(conv?.turns || []),
    signal,
    fetchImpl,
    repairHint,
  });

  let answer = null;
  let usedFallback = false;
  try {
    if (!isConfigured()) throw new AiError('AI_UNAVAILABLE', 'AI is not configured.');
    const first = await askOnce(null);
    let checked = normalizeAnswer(first.json);
    if (!checked.ok) {
      console.warn(`ai invalid output (${requestId}): ${checked.reason}`); // reason only, never the content
      const repaired = await askOnce(checked.reason);
      checked = normalizeAnswer(repaired.json);
    }
    if (!checked.ok) throw new AiError('AI_INVALID_OUTPUT', 'AI returned an unusable answer.', { retryable: true });
    answer = checked.answer;
  } catch (err) {
    if (err instanceof AiError && (err.code === 'CANCELLED' || err.code === 'UNSAFE_REQUEST' || err.code === 'INVALID_INPUT')) throw err;
    console.error(`ai fallback (${requestId}): ${err.code || err.name}`);
    usedFallback = true;
    answer = fallbackAnswer({ presetId, text: question, contextUsed: lines }).answer;
  }

  const id = conversationId || newConversationId();
  rememberTurn(id, question, answer);

  const payload = {
    ok: true,
    requestId,
    conversationId: id,
    intent: preset?.intent || intentFor({ presetId, text: question }),
    transcript,
    answer,
    meta: {
      cached: false,
      sampleData: Boolean(image?.isDemoSample),
      fallback: usedFallback,
      latencyMs: now() - startedAt,
    },
  };
  if (key && !usedFallback) cache.set(key, { at: now(), payload });
  return payload;
}

export function _reset() {
  cache.clear(); inFlight.clear(); recent.clear(); conversations.clear();
}
