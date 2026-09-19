import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { demoRouter } from '../routes/demo.js';
import { errorHandler } from '../middleware/errors.js';

async function appFor({ auth, env }) {
  const app = express();
  app.use('/api/demo', demoRouter({ auth, env }));
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('guided demo offers its fixed journeys without exposing account credentials', async () => {
  const app = await appFor({ auth: null, env: {} });
  try {
    const body = await (await fetch(`${app.base}/api/demo/brief`)).json();
    assert.deepEqual(body.demo.journeys.map((x) => x.id), ['now', 'alerts', 'trade']);
    assert.equal(JSON.stringify(body).includes('PIN'), false);
    const alert = await (await fetch(`${app.base}/api/demo/alerts`)).json();
    assert.equal(alert.alert.source, 'AgriLink demo scenario');
    assert.equal(alert.alert.disclosure.includes('not a live weather forecast'), true);
  } finally { await app.close(); }
});

test('guided demo signs in only with explicitly configured fictional credentials', async () => {
  const seen = [];
  const auth = { secureCookies: false, async login(credentials) {
    seen.push(credentials);
    return { session: { token: 'demo-token', expiresAt: new Date('2030-01-01') }, user: { id: 'demo-user', language: 'en' } };
  } };
  const app = await appFor({ auth, env: { DEMO_USER_PHONE: '9100000001', DEMO_USER_PIN: '246810' } });
  try {
    const response = await fetch(`${app.base}/api/demo/start`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.deepEqual(seen, [{ phone: '9100000001', pin: '246810' }]);
    assert.match(response.headers.get('set-cookie') || '', /agrilink_session=demo-token/);
    assert.equal((await response.json()).user.id, 'demo-user');
  } finally { await app.close(); }
});
