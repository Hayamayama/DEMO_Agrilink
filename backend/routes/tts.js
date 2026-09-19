import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { synthesize, TtsError, TTS_MAX_CHARS, isConfigured } from '../services/ttsService.js';

const PER_MINUTE = Number(process.env.TTS_RATE_LIMIT_PER_MINUTE) || 30;
const PER_DAY    = Number(process.env.TTS_RATE_LIMIT_PER_DAY)    || 500;

const ALLOWED_LANGUAGES = new Set(['en', 'hi', 'bn', 'vi']);

const limitPayload = (message) => ({
  ok: false,
  error: { code: 'TTS_RATE_LIMIT', message, retryable: true },
});

const perMinute = rateLimit({
  windowMs: 60_000, limit: PER_MINUTE, standardHeaders: true, legacyHeaders: false,
  message: limitPayload('Too many TTS requests. Wait a minute.'),
});
const perDay = rateLimit({
  windowMs: 24 * 60 * 60_000, limit: PER_DAY, standardHeaders: false, legacyHeaders: false,
  message: limitPayload('Daily TTS limit reached.'),
});

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

export function ttsRouter() {
  const router = Router();

  // Health / capability check.
  router.get('/capabilities', (_req, res) => {
    res.json({ ok: true, tts: isConfigured(), maxChars: TTS_MAX_CHARS, languages: [...ALLOWED_LANGUAGES] });
  });

  // Main endpoint: synthesize speech and return raw audio.
  router.post('/', perDay, perMinute, async (req, res) => {
    const { text, language } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return sendError(res, new TtsError('INVALID_INPUT', 'Text is required.'));
    }
    if (language && !ALLOWED_LANGUAGES.has(language)) {
      return sendError(res, new TtsError('INVALID_INPUT', `Unsupported language: ${language}`));
    }

    // Let client abort cancel the upstream Gemini call.
    const controller = new AbortController();
    req.on('aborted', () => controller.abort());

    try {
      const { audio, mimeType } = await synthesize(text.trim(), language || 'en', { signal: controller.signal });
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', audio.length);
      res.setHeader('Cache-Control', 'no-store');
      res.send(audio);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
