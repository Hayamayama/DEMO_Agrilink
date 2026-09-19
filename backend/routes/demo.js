import express from 'express';
import { AppError } from '../middleware/errors.js';

const DEMO_JOURNEYS = [
  { id: 'now', label: 'Now', purpose: 'See today’s farm work and a safe spray window.' },
  { id: 'alerts', label: 'Alerts', purpose: 'Read a fixed weather advisory with #.' },
  { id: 'trade', label: 'Trade', purpose: 'Review a deal and its pickup code.' },
];

function alertsFor(env) {
  const date = env.DEMO_DATE || '2026-09-19';
  return {
    date,
    source: 'AgriLink demo scenario',
    capturedAt: `${date}T09:00:00+05:30`,
    status: 'watch',
    headline: 'Rain likely after 15:00',
    action: 'Wait before spraying',
    details: [
      'Rain probability: 70%',
      'Wind: 18 km/h',
      'Best check again tomorrow morning',
    ],
    disclosure: 'Fixed demonstration data — not a live weather forecast.',
  };
}

function setSession(res, session, secure) {
  res.cookie('agrilink_session', session.token, {
    httpOnly: true, secure, sameSite: 'lax', path: '/', expires: session.expiresAt,
  });
}

/**
 * This router is mounted only when DEMO_MODE=true. It deliberately uses a
 * server-held demo account, so a judge can start the scripted journey without
 * typing a phone number or PIN on stage. It must never be mounted in product.
 */
export function demoRouter({ auth, env = process.env }) {
  const router = express.Router();
  router.get('/brief', (_req, res) => res.json({ ok: true, demo: { enabled: true, journeys: DEMO_JOURNEYS } }));
  router.get('/alerts', (_req, res) => res.json({ ok: true, alert: alertsFor(env) }));
  router.post('/start', async (_req, res, next) => {
    try {
      if (!auth) throw new AppError('AUTH_UNAVAILABLE', 'Demo sign-in is not configured.', { retryable: false });
      const phone = String(env.DEMO_USER_PHONE || '');
      const pin = String(env.DEMO_USER_PIN || '');
      if (!phone || !pin) throw new AppError('SERVICE_UNAVAILABLE', 'Demo account is not configured.', { retryable: false });
      const result = await auth.login({ phone, pin });
      setSession(res, result.session, auth.secureCookies);
      res.json({ ok: true, user: result.user, demo: { journey: 'now' } });
    } catch (err) { next(err); }
  });
  return router;
}
