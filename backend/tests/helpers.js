import express from 'express';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createAuthService } from '../services/authService.js';
import { authRouter } from '../routes/auth.js';
import { createForumRouter, loadForumConfig } from '../routes/forum.js';
import { forumErrorHandler } from '../middleware/errors.js';
import { ensureForumReference } from '../db/forumReference.js';
import { seedDemo, seedId } from '../db/forumSeed.js';

const migration = (name) => fs.readFileSync(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8');

// A pg.Pool look-alike over PGlite (real Postgres compiled to WASM), so the tests run the
// same SQL and the same migrations as production. There is one connection, so checked-out
// clients (transactions) are serialised against each other; plain pool.query calls go straight
// through, which is what the auth service relies on when it reads while its client is still open.
export function pgPool(db) {
  let tail = Promise.resolve();
  const lock = () => { let release; const p = new Promise((r) => { release = r; }); const prev = tail; tail = tail.then(() => p); return prev.then(() => release); };
  const run = async (text, params) => {
    const r = await db.query(text, params);
    return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
  };
  return {
    query: (text, params) => run(text, params),
    async connect() {
      const release = await lock();
      return { query: (t, p) => run(t, p), release };
    },
  };
}

export async function makeDb() {
  const db = new PGlite();
  await db.exec('CREATE ROLE agrilink_app; CREATE ROLE agrilink_migrator;');
  await db.exec(migration('001_foundation.sql').replace(/CREATE EXTENSION[^;]*;/, '')); // gen_random_uuid() is built in
  await db.exec(migration('004_identity_admin.sql'));
  await db.exec(migration('005_forum.sql'));
  await db.exec(migration('007_farm_operations.sql'));
  await db.exec(migration('008_region_coordinates.sql'));
  await db.exec(migration('011_farm_live_data.sql'));
  return { db, pool: pgPool(db) };
}

const ENV = { AUTH_LOOKUP_SECRET: 'x'.repeat(40), NODE_ENV: 'test' };

// Boots the real auth + forum routers on an ephemeral port over a seeded database.
export async function startForum(env = {}) {
  const { db, pool } = await makeDb();
  await ensureForumReference(pool);
  const auth = createAuthService(pool, ENV);
  await seedDemo(pool, { auth, pin: '246810' });
  const forum = createForumRouter({ pool, auth, config: loadForumConfig(env) });
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/auth', authRouter({ auth, pool }));
  app.use('/api/forum', forum.router);
  app.use(forumErrorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  // A tiny cookie-jar client: one per simulated browser.
  const client = () => {
    let cookie = '';
    const call = async (method, path, body, headers = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      for (const c of res.headers.getSetCookie?.() || []) cookie = c.split(';')[0].endsWith('=') ? '' : c.split(';')[0];
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
    };
    return {
      get: (p, h) => call('GET', p, null, h),
      post: (p, b, h) => call('POST', p, b ?? {}, h),
      put: (p, b, h) => call('PUT', p, b ?? {}, h),
      del: (p, h) => call('DELETE', p, null, h),
    };
  };

  // key = demo member key ('10000001'..'10000005'); their phone is 9100000 + the last 3 digits.
  const login = async (key = '10000001', pin = '246810') => {
    const c = client();
    const r = await c.post('/api/auth/login', { phone: `9100000${key.slice(-3)}`, pin });
    if (r.status !== 200) throw new Error(`login failed: ${JSON.stringify(r.body)}`);
    return c;
  };

  return { db, pool, auth, base, client, login, close: async () => { forum.close(); server.closeAllConnections(); server.close(); await db.close(); } };
}

// Ids of seeded content: the seed derives every uuid from a readable key.
export const postId = (name) => seedId(`post:seed_post_${name}`);
export const replyId = (name, n) => seedId(`reply:seed_post_${name}:${n}`);

let n = 0;
export const rid = () => `req-${Date.now()}-${++n}-abcdef`;
