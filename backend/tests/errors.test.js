import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { AppError, errorHandler } from '../middleware/errors.js';
import { requestId } from '../middleware/requestId.js';
import { sameOriginWrites } from '../middleware/sameOrigin.js';
import { quotaLimits } from '../middleware/memberAccess.js';
import { coded } from '../services/authService.js';
import { pricesRouter } from '../routes/prices.js';
import { createPriceService } from '../services/priceService.js';
import { memoryRepo } from '../services/priceRepo.js';

async function serve(build) {
  const app = express();
  app.use(requestId);
  build(app);
  app.use(errorHandler);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, init) => {
    const res = await fetch(base + path, init);
    return { status: res.status, id: res.headers.get('x-request-id'), body: await res.json() };
  };
  return { base, call, close:() => { server.closeAllConnections(); server.close(); } };
}

test('every error uses one envelope that carries the request id', async (t) => {
  const s = await serve((app) => {
    app.use(express.json());
    app.get('/app', () => { throw new AppError('NOT_FOUND', 'Post not found.'); });
    app.get('/coded', () => { throw coded('ACCOUNT_EXISTS', 'This phone number already has an account.', 409); });
    app.get('/bug', () => { throw new Error('relation "app.secret" does not exist'); });
    app.post('/json', (_req, res) => res.json({ ok: true }));
  });
  t.after(s.close);

  const app = await s.call('/app');
  assert.equal(app.status, 404);
  assert.deepEqual(app.body, { ok: false, error: { code: 'NOT_FOUND', message: 'Post not found.', field: null, retryable: false, requestId: app.id } });
  assert.match(app.id, /^[0-9a-f-]{36}$/);

  const dup = await s.call('/coded');
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'ACCOUNT_EXISTS');

  const bad = await s.call('/json', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_ERROR');

  const bug = await s.call('/bug');
  assert.equal(bug.status, 500);
  assert.equal(bug.body.error.code, 'INTERNAL_ERROR');
  assert.equal(bug.body.error.retryable, true);
  assert.ok(!JSON.stringify(bug.body).includes('app.secret'), 'internal messages never reach the client');
});

test('cross-site writes are refused; reads and same-origin writes pass', async (t) => {
  const s = await serve((app) => {
    app.use(sameOriginWrites);
    app.all('/x', (_req, res) => res.json({ ok: true }));
  });
  t.after(s.close);
  const evil = await s.call('/x', { method: 'POST', headers: { origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  assert.equal(evil.body.error.code, 'FORBIDDEN');
  assert.equal((await s.call('/x', { headers: { origin: 'https://evil.example' } })).status, 200);
  assert.equal((await s.call('/x', { method: 'POST', headers: { origin: s.base } })).status, 200);
  assert.equal((await s.call('/x', { method: 'POST' })).status, 200); // no Origin header: not a browser form post
});

test('prices answer in the envelope: ok on success, codes on failure', async (t) => {
  let broken = false;
  const repo = memoryRepo();
  const service = createPriceService({
    history: (...a) => (broken ? Promise.reject(new Error('db down')) : repo.history(...a)),
    crops: (...a) => repo.crops(...a),
  });
  const s = await serve((app) => app.use('/api/prices', pricesRouter(service)));
  t.after(s.close);

  const ok = await s.call('/api/prices?crop=rice&region=IN-UP-01');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.crop, 'rice');

  const crops = await s.call('/api/prices/crops?region=IN-UP-01');
  assert.equal(crops.body.ok, true);
  assert.ok(crops.body.items.length > 0);

  const missing = await s.call('/api/prices?crop=rice');
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, 'VALIDATION_ERROR');

  const none = await s.call('/api/prices?crop=saffron&region=IN-UP-01');
  assert.equal(none.status, 404);
  assert.equal(none.body.error.code, 'NO_DATA');

  broken = true;
  const down = await s.call('/api/prices?crop=rice&region=IN-UP-01');
  assert.equal(down.status, 503);
  assert.equal(down.body.error.code, 'PRICES_UNAVAILABLE');
  assert.equal(down.body.error.retryable, true);
});

test('quota rejections keep the route codes and add the request id', async (t) => {
  const payload = (message) => ({ ok: false, error: { code: 'AI_RATE_LIMIT', message, retryable: true } });
  const s = await serve((app) => {
    app.get('/ask', quotaLimits({ perMinute: 1, perDay: 10, globalPerDay: 10, payload }), (_req, res) => res.json({ ok: true }));
  });
  t.after(s.close);
  assert.equal((await s.call('/ask')).status, 200);
  const limited = await s.call('/ask');
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.code, 'AI_RATE_LIMIT');
  assert.equal(limited.body.error.requestId, limited.id);
});
