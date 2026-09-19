// Stable error envelope for Farmer Circle and Local Market: { ok:false, error:{ code, message, field, retryable } }.
// The UI branches on `code`, never on the English message.
const STATUS = {
  VALIDATION_ERROR: 400,
  AUTH_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 429,
  ACCOUNT_SUSPENDED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
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
  FARM_ACCESS_DENIED: 403,
  PROFILE_REQUIRED: 409,
  ROLE_REQUIRED: 403,
  INVALID_STATUS_TRANSITION: 409,
  TASK_DEPENDENCY_BLOCKED: 409,
  CHECKLIST_INCOMPLETE: 409,
};

export class AppError extends Error {
  constructor(code, message, { field = null, retryable = false, retryAfter = null } = {}) {
    super(message);
    this.code = code;
    this.status = STATUS[code] || 500;
    this.field = field;
    this.retryable = retryable || code === 'RATE_LIMITED';
    this.retryAfter = retryAfter;
  }
}

export const validation = (message, field = null) => new AppError('VALIDATION_ERROR', message, { field });

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res, next)).catch(next);
};

// Only claims errors for our own routes; other routers keep their own handling.
export function forumErrorHandler(err, req, res, next) {
  if (!/^\/api\/(forum|market|farms)(\/|$)/.test(req.path)) return next(err);
  if (res.headersSent) return next(err);
  let e = err;
  if (!(e instanceof AppError)) {
    if (e?.type === 'entity.parse.failed') e = validation('Request body is not valid JSON.');
    else if (e?.type === 'entity.too.large') e = validation('Request is too large.');
    else {
      // Never leak SQL text or stack traces; log only the message (no bodies, PINs or tokens).
      console.error('forum error:', e?.message);
      e = new AppError('INTERNAL_ERROR', 'Something went wrong. Please try again.', { retryable: true });
    }
  }
  if (e.retryAfter) res.set('Retry-After', String(e.retryAfter));
  res.status(e.status).json({ ok: false, error: { code: e.code, message: e.message, field: e.field, retryable: e.retryable } });
}

export function forumNotFound(_req, _res, next) {
  next(new AppError('NOT_FOUND', 'Not found.'));
}
