import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import weather from './routes/weather.js';
import { aiRouter } from './routes/ai.js';
import { pricesRouter } from './routes/prices.js';
import { createPool } from './db/pool.js';
import { memoryRepo, pgRepo } from './services/priceRepo.js';
import { createPriceService } from './services/priceService.js';
import { createAuthService } from './services/authService.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// nginx on the same host sets X-Forwarded-For; trusting only loopback lets the
// AI rate limiter key on the real client IP without letting clients spoof it.
app.set('trust proxy', 'loopback');

// Content Security Policy: no inline/remote scripts, no remote images. Media is
// uploaded to our own origin only; the Gemini key and calls stay server-side.
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.use(express.json({ limit: '32kb' })); // media goes through multipart, not JSON

// Postgres when DATABASE_URL is set, otherwise the in-memory demo data (flagged sample).
const pool = createPool();
console.log(pool ? 'prices: using Postgres' : 'prices: using in-memory seed data');
const prices = createPriceService(pool ? pgRepo(pool) : memoryRepo());
app.use('/api/prices', pricesRouter(prices));
app.use('/api/weather', weather);
app.use('/api/ai', aiRouter());
if (pool) {
  try {
    const auth = createAuthService(pool);
    app.use('/api/auth', authRouter({ auth, pool }));
    app.use('/api/admin', adminRouter({ auth, pool }));
    app.use('/admin', express.static(path.join(here, 'admin')));
    console.log('auth: PostgreSQL sessions enabled');
  } catch (err) {
    // Prices and offline AI are still useful on a local demo, but identity must
    // never silently use an insecure fallback when its secret is absent.
    console.warn(`auth: disabled (${err.message})`);
    app.use(['/api/auth', '/api/admin'], (_req, res) => res.status(503).json({ ok: false, error: { code: 'AUTH_UNAVAILABLE', message: 'Sign-in is not configured on this server.' } }));
  }
}
console.log(process.env.GEMINI_API_KEY ? 'ai: gemini configured' : 'ai: no GEMINI_API_KEY - Ask AI serves offline fallbacks');
app.use(express.static(path.join(here, '..', 'frontend')));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`AgriLink listening on :${port}`));
