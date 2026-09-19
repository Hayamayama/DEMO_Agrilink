import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { authRouter } from '../routes/auth.js';
import { coded } from '../services/authService.js';
import { createLimiter, limitByUser } from '../middleware/rateLimits.js';

// Every Cloud Phone handset reaches the server from CloudMosa's shared egress IP, which is what
// these tests simulate: all requests come from 127.0.0.1.

test('limitByUser keys signed-in requests by account and anonymous ones by IP', () => {
  const limiter = createLimiter();
  const mw = limitByUser(limiter, 'x', 2, 60000, 'requests');
  const run = (req) => { let err; mw({ ip: '203.0.113.1', ...req }, null, (e) => { err = e; }); return err?.code ?? 'ok'; };
  assert.deepEqual([run({ user: { id: 'a' } }), run({ user: { id: 'a' } }), run({ user: { id: 'a' } })], ['ok', 'ok', 'RATE_LIMITED']);
  // same IP, different member: unaffected by the first member's usage
  assert.deepEqual([run({ user: { id: 'b' } }), run({ user: { id: 'b' } })], ['ok', 'ok']);
  assert.deepEqual([run({}), run({}), run({})], ['ok', 'ok', 'RATE_LIMITED']);
});

test('login is limited per phone number, not for everyone behind the shared IP', async () => {
  const auth = { login: async () => { throw coded('INVALID_LOGIN', 'Phone number or PIN is incorrect.', 401); } };
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter({ auth, pool: null }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const login = (phone) => fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, pin: '000000' }),
  }).then((r) => r.status);
  try {
    for (let i = 0; i < 10; i++) assert.equal(await login('9100000001'), 401);
    assert.equal(await login('9100000001'), 429);
    // a different member on the same IP can still sign in
    assert.equal(await login('9100000002'), 401);
  } finally { server.closeAllConnections(); server.close(); }
});
