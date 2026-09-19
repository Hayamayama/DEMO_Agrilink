import { Router } from 'express';
import crypto from 'node:crypto';
import { synthesize, TtsError, TTS_MAX_CHARS } from '../services/ttsService.js';
import { memberOnly, quotaLimits } from '../middleware/memberAccess.js';

const PER_MINUTE = Number(process.env.TTS_RATE_LIMIT_PER_MINUTE) || 30;
const PER_DAY    = Number(process.env.TTS_RATE_LIMIT_PER_DAY)    || 500;
const GLOBAL_PER_DAY = Number(process.env.TTS_GLOBAL_LIMIT_PER_DAY) || 300;
const ALLOWED_LANGUAGES = new Set(['en', 'hi', 'bn', 'vi']);

const CACHE_MAX = 60;
const cache = new Map();
const cacheKey = (text, language) => crypto.createHash('sha256').update(`${language}\n${text}`).digest('hex');

function remember(key, value) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

function sendError(res, err) {
  if (err?.code === 'ERR_CANCELLED') return;
  const code = err instanceof TtsError ? err.code : 'ERR_UNKNOWN';
  const message = err instanceof TtsError ? err.message : 'Unknown internal error';
  
  console.error(`TTS Error [${code}]:`, message, err.originalError || '');
  
  res.status(500).json({
    ok: false,
    error: { code, message }
  });
}

export function ttsRouter({ auth } = {}) {
  const router = Router();
  const limits = quotaLimits({ 
    perMinute: PER_MINUTE, 
    perDay: PER_DAY, 
    globalPerDay: GLOBAL_PER_DAY, 
    payload: (msg) => ({ ok: false, error: { code: 'ERR_RATE_LIMIT', message: msg } }) 
  });

  router.post('/', memberOnly(auth), limits, async (req, res) => {
    const controller = new AbortController();
    req.on('aborted', () => controller.abort());

    try {
      const { text, language } = req.body || {};
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ ok: false, error: { code: 'ERR_INVALID_INPUT', message: 'Text is required' } });
      }
      
      const safeText = text.trim().slice(0, TTS_MAX_CHARS);
      const safeLang = language || 'en';

      if (safeLang !== 'en' && !ALLOWED_LANGUAGES.has(safeLang)) {
        return res.status(400).json({ ok: false, error: { code: 'ERR_UNSUPPORTED_LANGUAGE', message: 'Unsupported language' } });
      }

      const key = cacheKey(safeText, safeLang);
      const hit = cache.get(key);
      if (hit) {
        remember(key, hit);
        return res.type(hit.mimeType).send(hit.audio);
      }

      const result = await synthesize(safeText, safeLang, { signal: controller.signal });
      remember(key, result);
      res.type(result.mimeType).send(result.audio);
      
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
