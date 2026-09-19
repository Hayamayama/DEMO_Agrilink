import { AppError } from './errors.js';

// Cookies are SameSite=Lax; on top of that, reject browser-originated writes whose Origin does
// not match the host we were reached on.
export function sameOriginWrites(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    let host = null;
    try { host = new URL(origin).host; } catch { /* invalid origin: blocked below */ }
    const allowed = [req.headers.host, req.headers['x-forwarded-host']].filter(Boolean);
    if (!host || !allowed.includes(host)) return next(new AppError('FORBIDDEN', 'Cross-site request blocked.'));
  }
  next();
}
