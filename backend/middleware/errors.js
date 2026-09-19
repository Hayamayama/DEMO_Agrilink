// One error envelope for the whole API: { ok:false, error:{ code, message, field, retryable, requestId } }.
// The UI branches on `code`, never on the English message. Ask AI and TTS keep their own codes
// (AI_TIMEOUT, fallbackAvailable, ...) inside the same envelope; see routes/ai.js and routes/tts.js.
const STATUS = {
  VALIDATION_ERROR: 400,
  AUTH_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 429,
  ACCOUNT_SUSPENDED: 403,
  FORBIDDEN: 403,
  ADMIN_REQUIRED: 403,
  NOT_FOUND: 404,
  NO_DATA: 404,
  POST_LOCKED: 409,
  ALREADY_REPORTED: 409,
  RATE_LIMITED: 429,
  DUPLICATE_REQUEST: 409,
  INVALID_STATE: 409,
  CONFLICT: 409,
  QUANTITY_UNAVAILABLE: 409,
  PICKUP_LOCKED: 429,
  UPLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  AUTH_UNAVAILABLE: 503,
  PRICES_UNAVAILABLE: 503,
  WEATHER_UNAVAILABLE: 503,
  FARM_ACCESS_DENIED: 403,
  PROFILE_REQUIRED: 409,
  ROLE_REQUIRED: 403,
  INVALID_STATUS_TRANSITION: 409,
  TASK_DEPENDENCY_BLOCKED: 409,
  CHECKLIST_INCOMPLETE: 409,
};

export class AppError extends Error {
  constructor(code, message, { field = null, retryable = false, retryAfter = null, status = null } = {}) {
    super(message);
    this.code = code;
    this.status = status || STATUS[code] || 500;
    this.field = field;
    this.retryable = retryable || code === 'RATE_LIMITED';
    this.retryAfter = retryAfter;
  }
}

export const validation = (message, field = null) => new AppError('VALIDATION_ERROR', message, { field });

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res, next)).catch(next);
};

/** The error body every route sends; `req` supplies the request id. */
export function errorBody(req, { code, message, field = null, retryable = false, ...extra }) {
  return { ok: false, error: { code, message, field, retryable, ...extra, requestId: req?.requestId ?? null } };
}

const CODE = /^[A-Z][A-Z0-9_]*$/;

function toAppError(err, req) {
  if (err instanceof AppError) return err;
  // express.json(): malformed or oversized bodies are the client's problem, not a 500.
  if (err?.type === 'entity.parse.failed') return new AppError('VALIDATION_ERROR', 'Request body is not valid JSON.');
  if (err?.type === 'entity.too.large') return new AppError('VALIDATION_ERROR', 'Request is too large.');
  if (err?.type) return new AppError('VALIDATION_ERROR', 'Request could not be read.');
  // Errors that already carry a client-facing code and 4xx status (authService.coded()).
  const status = Number(err?.status);
  if (status >= 400 && status < 500 && CODE.test(err?.code || '')) {
    return new AppError(err.code, err.message, { status, retryable: status === 429 });
  }
  // Never leak SQL text or stack traces; log only the message (no bodies, PINs or tokens).
  console.error(`[${req.requestId ?? '-'}] ${req.method} ${req.originalUrl.split('?')[0]}: ${err?.message}`);
  return new AppError('INTERNAL_ERROR', 'Something went wrong. Please try again.', { retryable: true });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const e = toAppError(err, req);
  if (e.retryAfter) res.set('Retry-After', String(e.retryAfter));
  res.status(e.status).json(errorBody(req, { code: e.code, message: e.message, field: e.field, retryable: e.retryable }));
}

// Older name, still used by the dev servers and the test helpers.
export const forumErrorHandler = errorHandler;

export function forumNotFound(_req, _res, next) {
  next(new AppError('NOT_FOUND', 'Not found.'));
}

/** Mounted in place of a feature whose tables or secrets are missing on this server. */
export const unavailable = (message, code = 'SERVICE_UNAVAILABLE', retryable = true) =>
  (_req, _res, next) => next(new AppError(code, message, { retryable }));
