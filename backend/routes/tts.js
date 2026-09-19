import { Router } from 'express';
import crypto from 'node:crypto';
import { synthesize as defaultSynthesize, TtsError, TTS_MAX_CHARS, isConfigured } from '../services/ttsService.js';
import { memberOnly, quotaLimits } from '../middleware/memberAccess.js';

// Per signed-in member (Cloud Phone users share one egress IP), plus a server-wide daily cap:
// the TTS model has a small quota and shares GEMINI_API_KEY with Ask AI.
const PER_MINUTE = Number(process.env.TTS_RATE_LIMIT_PER_MINUTE) || 30;
const PER_DAY    = Number(process.env.TTS_RATE_LIMIT_PER_DAY)    || 500;
const GLOBAL_PER_DAY = Number(process.env.TTS_GLOBAL_LIMIT_PER_DAY) || 300;

const ALLOWED_LANGUAGES = new Set(['en', 'hi', 'bn', 'vi']);

const limitPayload = (message) => ({
  ok: false,
  error: { code: 'TTS_RATE_LIMIT', message, retryable: true },
});

// Most requests read the same screens (menus, a price list) again, so recent audio is kept in
// memory and served without calling Gemini. Small LRU: a Map keeps insertion order.
const CACHE_MAX = 60;
const cache = new Map();
const cacheKey = (text, language) => crypto.createHash('sha256').update(`${language}\n${text}`).digest('hex');
function remember(key, value) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

const STATUS = {
  TTS_EMPTY: 400, TTS_UNAVAILABLE: 503, TTS_TIMEOUT: 504,
  TTS_RATE_LIMIT: 429, TTS_NO_AUDIO: 502, CANCELLED: 499,
  INVALID_INPUT: 400,
};

function sendError(res, err) {
  const code = err instanceof TtsError ? err.code : 'INTERNAL_ERROR';
  if (code === 'CANCELLED') return;
  if (!(err instanceof TtsError)) console.error('tts route error:', err.message);
  res.status(STATUS[code] || 500).json({
    ok: false,
    error: { code, message: err instanceof TtsError ? err.message : 'Something went wrong.', retryable: Boolean(err.retryable) },
  });
}

export function ttsRouter({ auth, synthesize = defaultSynthesize } = {}) {
  const router = Router();
  const limits = quotaLimits({ perMinute: PER_MINUTE, perDay: PER_DAY, globalPerDay: GLOBAL_PER_DAY, payload: limitPayload });

  // Health / capability check.
  router.get('/capabilities', (_req, res) => {
    res.json({ ok: true, tts: isConfigured(), maxChars: TTS_MAX_CHARS, languages: [...ALLOWED_LANGUAGES] });
  });

  const sendAudio = (res, { audio, mimeType }) => {
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', audio.length);
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  };

  // Validates, then serves a cached clip without touching the quota; only misses are rate limited.
  function readRequest(req, res, next) {
    const { text, language } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return sendError(res, new TtsError('INVALID_INPUT', 'Text is required.'));
    }
    if (language && !ALLOWED_LANGUAGES.has(language)) {
      return sendError(res, new TtsError('INVALID_INPUT', `Unsupported language: ${language}`));
    }
    req.tts = { text: text.trim().slice(0, TTS_MAX_CHARS), language: language || 'en' };
    req.tts.key = cacheKey(req.tts.text, req.tts.language);
    const hit = cache.get(req.tts.key);
    if (hit) { remember(req.tts.key, hit); return sendAudio(res, hit); }
    next();
  }

  // Main endpoint: synthesize speech and return raw audio.
  router.post('/', memberOnly(auth), readRequest, limits, async (req, res) => {
    // Let client abort cancel the upstream Gemini call.
    const controller = new AbortController();
    req.on('aborted', () => controller.abort());

    try {
      const clip = await synthesize(req.tts.text, req.tts.language, { signal: controller.signal });
      remember(req.tts.key, clip);
      sendAudio(res, clip);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
