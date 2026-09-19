import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { askAI } from '../services/aiAdapter.js';
import { normalizeRequest, LIMITS } from '../services/aiSchemas.js';
import { AiError, isConfigured } from '../services/geminiProvider.js';
import { validateImage, validateAudio, MAX_IMAGE_BYTES, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from '../services/mediaService.js';
import { PRESETS } from '../services/aiPresets.js';

const PER_MINUTE = Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || 6;
const PER_DAY = Number(process.env.AI_RATE_LIMIT_PER_DAY) || 30;

// Memory storage only: nothing touches disk, so there is no temp file to leak or clean up.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 2, fields: 8 },
});

const limitPayload = (message) => ({
  ok: false,
  error: { code: 'AI_RATE_LIMIT', message, retryable: true, fallbackAvailable: true },
});

const perMinute = rateLimit({
  windowMs: 60_000, limit: PER_MINUTE, standardHeaders: true, legacyHeaders: false,
  message: limitPayload('Too many questions. Wait a minute.'),
});
const perDay = rateLimit({
  windowMs: 24 * 60 * 60_000, limit: PER_DAY, standardHeaders: false, legacyHeaders: false,
  message: limitPayload('Daily demo limit reached.'),
});

const RETRYABLE = new Set(['AI_TIMEOUT', 'AI_RATE_LIMIT', 'AI_UNAVAILABLE', 'AI_INVALID_OUTPUT']);
const STATUS = {
  INVALID_INPUT: 400, MEDIA_UNSUPPORTED: 415, MEDIA_TOO_LARGE: 413, UNSAFE_REQUEST: 400,
  AI_RATE_LIMIT: 429, AI_TIMEOUT: 504, AI_UNAVAILABLE: 503, AI_INVALID_OUTPUT: 502, INTERNAL_ERROR: 500,
};

function sendError(res, err) {
  const code = err instanceof AiError ? err.code : 'INTERNAL_ERROR';
  if (code === 'CANCELLED') return; // client aborted; nothing to write
  if (!(err instanceof AiError)) console.error('ai route error:', err.message);
  res.status(STATUS[code] || 500).json({
    ok: false,
    error: {
      code,
      message: err instanceof AiError ? err.message : 'Something went wrong.',
      retryable: RETRYABLE.has(code),
      fallbackAvailable: true,
    },
  });
}

export function aiRouter() {
  const router = Router();

  router.get('/capabilities', (_req, res) => {
    res.json({
      ok: true,
      provider: 'gemini',
      text: isConfigured(),
      image: isConfigured(),
      audio: isConfigured(),
      maxTextChars: LIMITS.text,
      maxImageBytes: MAX_IMAGE_BYTES,
      maxAudioSeconds: MAX_AUDIO_SECONDS,
      presets: PRESETS.map(({ id, label, intent }) => ({ id, label, intent })),
    });
  });

  router.post('/ask', perDay, perMinute, async (req, res) => {
    const parsed = normalizeRequest(req.body);
    if (!parsed.ok) return sendError(res, new AiError('INVALID_INPUT', 'Question could not be read.'));
    const { requestId, conversationId, presetId, text, language, userContext } = parsed.request;
    if (!presetId && !text) return sendError(res, new AiError('INVALID_INPUT', 'Ask a question first.'));
    try {
      res.json(await askAI({
        requestId, conversationId, presetId, text, language, userContext,
        signal: abortSignalFor(req),
      }));
    } catch (err) { sendError(res, err); }
  });

  router.post('/ask-media', perDay, perMinute, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
    let image = null;
    let audio = null;
    try {
      const context = parseContext(req.body.context);
      const parsed = normalizeRequest({
        requestId: req.body.requestId,
        conversationId: req.body.conversationId || null,
        presetId: req.body.presetId || null,
        text: req.body.text || '',
        language: req.body.language || 'en',
        userContext: context,
      });
      if (!parsed.ok) throw new AiError('INVALID_INPUT', 'Question could not be read.');

      const imageFile = req.files?.image?.[0];
      const audioFile = req.files?.audio?.[0];
      if (imageFile) image = validateImage(imageFile);
      if (audioFile) audio = validateAudio(audioFile);
      if (!image && !audio && !parsed.request.text && !parsed.request.presetId) {
        throw new AiError('INVALID_INPUT', 'Attach a photo or recording.');
      }
      if (image && req.body.demoSample === '1') image.isDemoSample = true;

      res.json(await askAI({ ...parsed.request, image, audio, signal: abortSignalFor(req) }));
    } catch (err) {
      sendError(res, err);
    } finally {
      // Drop the buffers immediately; multer's memory storage holds no other copy.
      if (req.files) for (const list of Object.values(req.files)) for (const f of list) f.buffer = null;
      if (image) image.data = null;
      if (audio) audio.data = null;
    }
  });

  // Multer's own errors (file too big, too many files) must use the same envelope.
  router.use((err, _req, res, next) => {
    if (res.headersSent) return next(err);
    if (err?.code === 'LIMIT_FILE_SIZE') return sendError(res, new AiError('MEDIA_TOO_LARGE', 'Attachment is too large.'));
    if (err?.name === 'MulterError') return sendError(res, new AiError('MEDIA_UNSUPPORTED', 'Attachment could not be read.'));
    return sendError(res, err);
  });

  return router;
}

function parseContext(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new AiError('INVALID_INPUT', 'Question could not be read.');
  }
}

// Lets a cancelled handset request abort the upstream Gemini call instead of paying for it.
function abortSignalFor(req) {
  const controller = new AbortController();
  req.on('aborted', () => controller.abort());
  return controller.signal;
}
