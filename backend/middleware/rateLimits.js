import { AppError } from './errors.js';

// Small in-memory sliding-window limiter. State resets on restart, which is
// acceptable for the demo; the login lockout is also persisted in SQLite.
export function createLimiter() {
  const buckets = new Map();

  function live(key, windowMs, t) {
    const arr = (buckets.get(key) || []).filter((x) => t - x < windowMs);
    if (arr.length) buckets.set(key, arr); else buckets.delete(key);
    return arr;
  }

  return {
    /** Records a hit; throws RATE_LIMITED when over `limit` in `windowMs`. */
    hit(key, limit, windowMs, what = 'requests') {
      const t = Date.now();
      const arr = live(key, windowMs, t);
      if (arr.length >= limit) throw tooMany(what, arr[0] + windowMs - t);
      arr.push(t);
      buckets.set(key, arr);
    },
    count(key, windowMs) { return live(key, windowMs, Date.now()).length; },
    record(key) { const a = buckets.get(key) || []; a.push(Date.now()); buckets.set(key, a); },
    clear(key) { buckets.delete(key); },
    retryAfterMs(key, windowMs) { const a = live(key, windowMs, Date.now()); return a.length ? a[0] + windowMs - Date.now() : 0; },
    sweep() { const t = Date.now(); for (const [k, a] of buckets) if (!a.length || t - a[a.length - 1] > 86400000) buckets.delete(k); },
  };
}

export function tooMany(what, retryMs) {
  const secs = Math.max(1, Math.ceil(retryMs / 1000));
  const hint = secs >= 120 ? `${Math.ceil(secs / 60)} minutes` : `${secs} seconds`;
  return new AppError('RATE_LIMITED', `Too many ${what}. Try again in ${hint}.`, { retryable: true, retryAfter: secs });
}

export function limitByIp(limiter, name, limit, windowMs, what) {
  return (req, _res, next) => {
    try { limiter.hit(`${name}:${req.ip}`, limit, windowMs, what); next(); } catch (e) { next(e); }
  };
}
