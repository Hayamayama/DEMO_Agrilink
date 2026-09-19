import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { versionRouter } from '../routes/version.js';

test('version endpoint identifies the exact demo build', async () => {
  const app = express();
  app.use('/api/version', versionRouter({ env: { DEMO_MODE: 'true' }, commit: 'abcdef0123456789', startedAt: '2026-09-19T00:00:00.000Z' }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const body = await (await fetch(`http://127.0.0.1:${server.address().port}/api/version`)).json();
    assert.deepEqual(body, { ok: true, app: { name: 'AgriLink Demo', commit: 'abcdef0123456789', shortCommit: 'abcdef0', startedAt: '2026-09-19T00:00:00.000Z', demoMode: true } });
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
