import crypto from 'node:crypto';
import { POSTS, DEMO_USERS, DEMO_REGIONS, VOTER_COUNT } from './forumSeedData.js';

// Deterministic demo content for Farmer Circle. Safe to run repeatedly: rows use
// fixed ids and every run only refreshes their timestamps (so the forum looks
// recent) - it never duplicates data and never touches real users' content.
//
// Scores are NOT stored: they come from vote rows. Each post/reply gets that many
// +1 votes from fictional "voter" users (status 'deleted', no credentials, so they
// can never sign in and stay out of active-user lists).

// Stable uuid from a seed key, so ids are the same on every machine and run.
export const seedId = (key) => {
  const h = crypto.createHash('md5').update(`agrilink-forum:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const at = (minAgo, now) => new Date(now - minAgo * 60000);

/**
 * @param pool  pg Pool (or compatible)
 * @param auth  the app's auth service; demo members are created through auth.signup
 *              so they get the same PIN hashing and profile rows as real accounts.
 */
export async function seedDemo(pool, { auth, pin = process.env.DEMO_USER_PIN, now = Date.now() } = {}) {
  if (!pin) {
    if (process.env.NODE_ENV === 'production') throw new Error('DEMO_USER_PIN must be set to seed demo data in production');
    pin = '246810'; // documented demo-only default; never used in production
  }
  if (!/^\d{6}$/.test(pin)) throw new Error('DEMO_USER_PIN must be exactly 6 digits');

  for (const [code, country, name, lat, lon] of DEMO_REGIONS) {
    // Existing regions keep their name; only missing coordinates are filled in.
    await pool.query(`INSERT INTO app.regions (code, country_code, name, latitude, longitude) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (code) DO UPDATE SET latitude = COALESCE(app.regions.latitude, EXCLUDED.latitude),
        longitude = COALESCE(app.regions.longitude, EXCLUDED.longitude)`, [code, country, name, lat, lon]);
  }
  const regionIds = new Map((await pool.query('SELECT code, id FROM app.regions')).rows.map((r) => [r.code, r.id]));

  // Demo members. Found by demo_key; created via auth.signup the first time.
  const userIds = new Map();
  for (const [key, phone, displayName, village, regionCode, role] of DEMO_USERS) {
    let id = (await pool.query('SELECT user_id FROM app.forum_user_state WHERE demo_key = $1', [key])).rows[0]?.user_id;
    if (!id) {
      let user;
      try {
        ({ user } = await auth.signup({ phone, pin, displayName, village, regionId: regionIds.get(regionCode) }));
      } catch (err) {
        if (err.code !== 'ACCOUNT_EXISTS') throw err;
        ({ user } = await auth.login({ phone, pin })); // seeded earlier without a state row
      }
      id = user.id;
      await pool.query(`INSERT INTO app.forum_user_state (user_id, demo_key) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET demo_key = EXCLUDED.demo_key`, [id, key]);
    }
    if (role !== 'member') await pool.query('UPDATE app.users SET role = $2, updated_at = now() WHERE id = $1 AND role = \'member\'', [id, role]);
    userIds.set(key, id);
  }
  const voters = Array.from({ length: VOTER_COUNT }, (_, n) => seedId(`voter:${n + 1}`));
  await pool.query(`INSERT INTO app.users (id, status) SELECT unnest($1::uuid[]), 'deleted' ON CONFLICT (id) DO NOTHING`, [voters]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const votes = []; // [userId, type, targetId, createdAt]
    for (const p of POSTS) {
      const id = seedId(`post:${p.id}`);
      const authorKey = p.author;
      const regionCode = DEMO_USERS.find((u) => u[0] === authorKey)[4];
      const created = at(p.ago, now);
      const replyAgo = p.replies.map((_, k) => Math.max(5, Math.floor(p.ago / (k + 2))));
      const activity = replyAgo.length ? at(Math.min(...replyAgo), now) : created;
      const replyIds = p.replies.map((_, k) => seedId(`reply:${p.id}:${k + 1}`));
      await client.query(`INSERT INTO app.forum_posts (id, author_id, community_id, region_id, type, title, body, accepted_reply_id,
          is_pinned, is_demo, created_at, updated_at, last_activity_at)
        VALUES ($1, $2, (SELECT id FROM app.forum_communities WHERE slug = $3), $4, $5, $6, $7, $8, $9, true, $10, $10, $11)
        ON CONFLICT (id) DO UPDATE SET created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, last_activity_at = EXCLUDED.last_activity_at`,
      [id, userIds.get(authorKey), p.community, regionIds.get(regionCode), p.type, p.title, p.body, p.solved ? replyIds[0] : null, Boolean(p.pinned), created, activity]);
      for (const t of p.tags) {
        await client.query('INSERT INTO app.forum_post_tags (post_id, tag_id) SELECT $1, id FROM app.forum_tags WHERE slug = $2 ON CONFLICT DO NOTHING', [id, t]);
      }
      // `score` upvotes from the fictional voters (never the author; self-voting is not allowed).
      const cast = (type, targetId, score, ago) => { for (let n = 0; n < score; n++) votes.push([voters[n], type, targetId, at(ago, now)]); };
      cast('post', id, p.score, Math.max(1, p.ago - 5));
      for (const [k, [author, body, score]] of p.replies.entries()) {
        await client.query(`INSERT INTO app.forum_replies (id, post_id, author_id, body, is_demo, created_at, updated_at)
          VALUES ($1, $2, $3, $4, true, $5, $5)
          ON CONFLICT (id) DO UPDATE SET created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
        [replyIds[k], id, userIds.get(author), body, at(replyAgo[k], now)]);
        cast('reply', replyIds[k], score, replyAgo[k]);
      }
    }
    await client.query(`INSERT INTO app.forum_votes (user_id, target_type, target_id, value, created_at, updated_at)
      SELECT u, t, i, 1, c, c FROM unnest($1::uuid[], $2::text[], $3::uuid[], $4::timestamptz[]) AS x(u, t, i, c)
      ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
    [votes.map((v) => v[0]), votes.map((v) => v[1]), votes.map((v) => v[2]), votes.map((v) => v[3])]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
  return { users: DEMO_USERS.length, voters: VOTER_COUNT, posts: POSTS.length, demoPin: pin };
}

export const DEMO_PHONES = DEMO_USERS.map(([, phone, name, , , role]) => ({ phone, name, role }));

// `npm run forum:seed` - seeds the database in DATABASE_URL (needs AUTH_LOOKUP_SECRET).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { default: dotenv } = await import('dotenv');
  dotenv.config();
  const { createPool } = await import('./pool.js');
  const { createAuthService } = await import('../services/authService.js');
  const { ensureForumReference } = await import('./forumReference.js');
  const pool = createPool();
  if (!pool) throw new Error('DATABASE_URL is required.');
  try {
    await ensureForumReference(pool);
    const r = await seedDemo(pool, { auth: createAuthService(pool) });
    console.log(`Seeded ${r.posts} posts, ${r.users} demo members, ${r.voters} voter placeholders.`);
    console.log('Demo phones: ' + DEMO_PHONES.map((d) => `${d.phone} (${d.name})`).join(', ') + ' — PIN from DEMO_USER_PIN');
  } finally { await pool.end(); }
}
