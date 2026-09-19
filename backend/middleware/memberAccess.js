import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { sessionFromRequest } from '../routes/auth.js';

// Gemini-backed routes (Ask AI, TTS) spend a shared API quota, so only signed-in members may call
// them. Without a database there is no one to sign in: the local offline demo stays open.
export function memberOnly(auth) {
  if (!auth) return (_req, _res, next) => next();
  return async (req, res, next) => {
    try {
      const user = await auth.session(sessionFromRequest(req));
      if (!user) return res.status(401).json({ ok: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.', retryable: false } });
      req.user = user;
      next();
    } catch (err) { next(err); }
  };
}

// All Cloud Phone handsets share CloudMosa's egress IPs, so limits are per member; the IP is only
// the fallback when no one is signed in (local demo).
export const memberKey = (req) => (req.user?.id ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`);

/**
 * Per-member limits plus one server-wide daily cap that protects the shared quota. The member
 * limits run first so a request they reject never uses up the global allowance.
 */
export function quotaLimits({ perMinute, perDay, globalPerDay, payload }) {
  const day = 24 * 60 * 60_000;
  return [
    rateLimit({ windowMs: 60_000, limit: perMinute, keyGenerator: memberKey, standardHeaders: true, legacyHeaders: false,
      message: payload('Too many requests. Wait a minute.') }),
    rateLimit({ windowMs: day, limit: perDay, keyGenerator: memberKey, standardHeaders: false, legacyHeaders: false,
      message: payload('Your daily limit is reached. Try again tomorrow.') }),
    rateLimit({ windowMs: day, limit: globalPerDay, keyGenerator: () => 'all', standardHeaders: false, legacyHeaders: false,
      message: payload('Daily limit for everyone reached. Try again tomorrow.') }),
  ];
}
