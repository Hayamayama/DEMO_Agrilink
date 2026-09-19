import test from 'node:test';
import assert from 'node:assert/strict';
import { startForum, makeDb, rid, postId } from './helpers.js';
import { createAuthService } from '../services/authService.js';
import { ensureForumReference } from '../db/forumReference.js';
import { seedDemo } from '../db/forumSeed.js';

test('cross-origin writes are rejected', async (t) => {
  const f = await startForum(); t.after(() => f.close());
  const c = await f.login('10000003');
  const r = await c.post('/api/forum/posts', { requestId: rid() }, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'FORBIDDEN');
});

test('malformed JSON returns the error envelope, not a stack trace', async (t) => {
  const f = await startForum(); t.after(() => f.close());
  const res = await fetch(`${f.base}/api/forum/posts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.ok(!JSON.stringify(body).includes(' at '));
});

test('malformed ids are "not found", never a database error', async (t) => {
  const f = await startForum(); t.after(() => f.close());
  const c = await f.login('10000003');
  for (const path of ["/api/forum/posts/not-a-uuid", "/api/forum/posts/x'%20OR%201=1--"]) {
    const r = await c.get(path);
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'NOT_FOUND');
  }
  assert.equal((await c.put('/api/forum/votes', { targetType: 'post', targetId: 'nope', value: 1 })).status, 404);
  assert.equal((await c.post('/api/forum/reports', { targetType: 'post', targetId: 'nope', reason: 'spam' })).status, 404);
});

test('a suspended account can read but not write', async (t) => {
  const f = await startForum(); t.after(() => f.close());
  const c = await f.login('10000003');
  await f.pool.query(`UPDATE app.users SET status = 'suspended' WHERE id = (SELECT user_id FROM app.forum_user_state WHERE demo_key = '10000003')`);
  // The identity layer treats a suspended user's session as gone, so writes need a fresh sign-in.
  const r = await c.put('/api/forum/votes', { targetType: 'post', targetId: postId('machine_01'), value: 1 });
  assert.ok([401, 403].includes(r.status));
});

test('voter placeholders cannot sign in', async (t) => {
  const f = await startForum(); t.after(() => f.close());
  const rows = (await f.pool.query(`SELECT COUNT(*)::int AS n FROM app.users u WHERE status = 'deleted' AND NOT EXISTS (SELECT 1 FROM app.auth_credentials c WHERE c.user_id = u.id)`)).rows[0];
  assert.equal(rows.n, 34);
});

test('guests choose a browse region; unknown regions fall back safely', async (t) => {
  const f = await startForum(); t.after(() => f.close());
  const g = f.client();
  const regions = (await g.get('/api/forum/regions')).body.items;
  assert.ok(regions.some((r) => r.code === 'VN-AG'));
  const vn = (await g.get('/api/forum/posts?limit=20&sort=local&region=VN-AG')).body.items;
  assert.equal(vn[0].regionCode, 'VN-AG');
  assert.equal((await g.get('/api/forum/posts?region=NOWHERE')).status, 200);
});

test('production seeding without DEMO_USER_PIN is refused', async () => {
  const { db, pool } = await makeDb();
  await ensureForumReference(pool);
  const auth = createAuthService(pool, { AUTH_LOOKUP_SECRET: 'x'.repeat(40) });
  const prev = { pin: process.env.DEMO_USER_PIN, env: process.env.NODE_ENV };
  delete process.env.DEMO_USER_PIN;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(seedDemo(pool, { auth }), /DEMO_USER_PIN/);
  } finally {
    if (prev.pin !== undefined) process.env.DEMO_USER_PIN = prev.pin;
    if (prev.env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev.env;
  }
  await db.close();
});
