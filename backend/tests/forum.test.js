import test from 'node:test';
import assert from 'node:assert/strict';
import { startForum, rid, postId, replyId } from './helpers.js';
import { makeDb } from './helpers.js';
import { createAuthService } from '../services/authService.js';
import { ensureForumReference } from '../db/forumReference.js';
import { seedDemo } from '../db/forumSeed.js';

const post = (over = {}) => ({
  requestId: rid(), type: 'question', community: 'crop-talk', title: 'Brown spots appeared after rain',
  body: 'The spots appeared on older rice leaves after three days of rain.', tags: ['rice', 'disease'], locationScope: 'region', ...over,
});

test('guest can list communities, read the feed and open a post', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const g = f.client();
  const comm = await g.get('/api/forum/communities');
  assert.deepEqual(comm.body.items.map((c) => c.slug), ['crop-talk', 'machinery', 'market-talk', 'livestock', 'farm-life']);
  assert.equal(comm.body.items[0].postCount, 3);

  const feed = await g.get('/api/forum/posts?limit=20');
  assert.equal(feed.body.items.length, 12);
  assert.equal(feed.body.items[0].body, undefined, 'feed never carries the full body');

  const detail = await g.get(`/api/forum/posts/${postId('crop_01')}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.post.title, 'Brown spots appeared after three rainy days');
  assert.equal(detail.body.viewer.authenticated, false);
  assert.equal(detail.body.viewer.canReply, false);
});

test('seed scores and reply counts come from vote/reply rows', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const feed = (await f.client().get('/api/forum/posts?limit=20&sort=new')).body.items;
  const byId = Object.fromEntries(feed.map((p) => [p.id, p]));
  assert.equal(byId[postId('crop_01')].score, 24);
  assert.equal(byId[postId('crop_01')].replyCount, 3);
  assert.equal(byId[postId('crop_01')].isSolved, true);
  assert.equal(byId[postId('rules_01')].score, 30);
  assert.equal(byId[postId('machine_01')].replyCount, 2);
  assert.ok(feed.every((p) => p.isDemo));
});

test('seed is idempotent and refreshes timestamps', async () => {
  const { db, pool } = await makeDb();
  await ensureForumReference(pool);
  const auth = createAuthService(pool, { AUTH_LOOKUP_SECRET: 'x'.repeat(40) });
  await seedDemo(pool, { auth, pin: '246810', now: Date.parse('2026-09-01T00:00:00Z') });
  const tables = ['app.users', 'app.user_profiles', 'app.auth_credentials', 'app.forum_posts', 'app.forum_replies', 'app.forum_votes', 'app.forum_post_tags'];
  const count = async () => Promise.all(tables.map(async (t) => (await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`)).rows[0].n));
  const before = await count();
  await seedDemo(pool, { auth, pin: '246810', now: Date.parse('2026-09-19T00:00:00Z') });
  assert.deepEqual(await count(), before);
  const p = (await pool.query('SELECT created_at FROM app.forum_posts WHERE id = $1', [postId('crop_01')])).rows[0];
  assert.ok(p.created_at.toISOString().startsWith('2026-09-18'), 'demo dates follow the latest seed run');
  await db.close();
});

test('sort: new puts pinned first then newest; top uses score; local prefers the viewer region', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const g = f.client();
  const ids = async (qs) => (await g.get(`/api/forum/posts?limit=20&${qs}`)).body.items.map((p) => p.id);

  const nw = await ids('sort=new');
  assert.equal(nw[0], postId('rules_01'), 'pinned first');
  assert.equal(nw[1], postId('market_01'), 'then created_at DESC');

  const top = await ids('sort=top');
  assert.equal(top[0], postId('rules_01'));
  assert.equal(top[1], postId('crop_01'), 'highest score (24) after the pinned post');

  const local = (await g.get('/api/forum/posts?limit=20&sort=local&region=VN-AG')).body.items;
  assert.equal(local[0].regionCode, 'VN-AG', 'same region first');
  const firstOther = local.findIndex((p) => p.regionCode !== 'VN-AG');
  assert.ok(local.slice(firstOther).every((p) => p.regionCode !== 'VN-AG'));
});

test('filters: community, tag, type, status, scope', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const g = f.client();
  const list = async (qs) => (await g.get(`/api/forum/posts?limit=20&${qs}`)).body.items;
  assert.ok((await list('community=machinery')).every((p) => p.community.slug === 'machinery'));
  assert.equal((await list('community=machinery')).length, 2);
  assert.ok((await list('tag=rice')).every((p) => p.tags.includes('rice')));
  assert.ok((await list('type=local_report')).every((p) => p.type === 'local_report'));
  assert.deepEqual((await list('status=solved')).map((p) => p.id), [postId('crop_01')]);
  assert.ok((await list('status=open')).every((p) => p.type === 'question' && !p.isSolved));
  assert.ok((await list('scope=region&region=IN-BR')).every((p) => p.regionCode === 'IN-BR'));
  assert.ok((await list('scope=country&region=IN-BR')).every((p) => p.countryCode === 'IN'));
  assert.equal((await g.get('/api/forum/posts?sort=bogus')).status, 400);
});

test('cursor pagination walks the feed without repeats', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const g = f.client();
  const seen = [];
  let cursor = null;
  do {
    const r = await g.get(`/api/forum/posts?sort=new&limit=5${cursor ? `&cursor=${cursor}` : ''}`);
    seen.push(...r.body.items.map((p) => p.id));
    cursor = r.body.nextCursor;
  } while (cursor);
  assert.equal(seen.length, 12);
  assert.equal(new Set(seen).size, 12);
  assert.equal((await g.get('/api/forum/posts?cursor=%%%')).status, 400);
});

test('guest cannot post, reply, vote, save, report or solve', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const g = f.client();
  const attempts = [
    g.post('/api/forum/posts', post()),
    g.post(`/api/forum/posts/${postId('crop_01')}/replies`, { requestId: rid(), body: 'hello there' }),
    g.put('/api/forum/votes', { targetType: 'post', targetId: postId('crop_01'), value: 1 }),
    g.put(`/api/forum/posts/${postId('crop_01')}/save`),
    g.del(`/api/forum/posts/${postId('crop_01')}/save`),
    g.post('/api/forum/reports', { targetType: 'post', targetId: postId('crop_01'), reason: 'spam' }),
    g.put(`/api/forum/posts/${postId('crop_01')}/solution`, { replyId: replyId('crop_01', 1) }),
    g.get('/api/forum/me/posts'),
    g.get('/api/forum/me/saved'),
  ];
  for (const r of await Promise.all(attempts)) {
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'AUTH_REQUIRED');
  }
});

test('member can create a post; validation rejects bad input; duplicate request id returns the original', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const c = await f.login('10000003');
  const body = post();
  const r = await c.post('/api/forum/posts', body);
  assert.equal(r.status, 201);
  assert.equal(r.body.post.author.displayName, 'Minh Tran');
  assert.equal(r.body.post.regionCode, 'VN-AG');
  assert.deepEqual(r.body.post.tags, ['disease', 'rice']);
  assert.equal(r.body.post.isDemo, false);

  const again = await c.post('/api/forum/posts', body);
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.post.id, r.body.post.id);
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM app.forum_posts WHERE title = $1', [body.title])).rows[0].n, 1);

  for (const [over, field] of [
    [{ title: 'short' }, 'title'],
    [{ title: 'x'.repeat(81) }, 'title'],
    [{ body: 'too short' }, 'body'],
    [{ body: 'y'.repeat(501) }, 'body'],
    [{ body: 'a\n\nb b b b b\n\nc\n\nd\n\ne' }, 'body'],
    [{ body: 'See www.scam.example for cheap seeds now' }, 'body'],
    [{ title: 'Visit https://x.example please now' }, 'title'],
    [{ tags: ['rice', 'pest', 'soil'] }, 'tags'],
    [{ tags: ['made-up'] }, 'tags'],
    [{ community: 'nope' }, 'community'],
    [{ type: 'poll' }, 'type'],
    [{ locationScope: 'planet' }, 'locationScope'],
    [{ requestId: 'x' }, 'requestId'],
  ]) {
    const bad = await c.post('/api/forum/posts', post(over));
    assert.equal(bad.status, 400, field);
    assert.equal(bad.body.error.field, field);
  }
  // Whitespace is collapsed and stored as plain text.
  const ws = await c.post('/api/forum/posts', post({ title: '  Spaced    out   title here  ', body: '<b>bold</b> text that is long enough' }));
  assert.equal(ws.body.post.title, 'Spaced out title here');
  assert.equal(ws.body.post.body, '<b>bold</b> text that is long enough');
});

test('post creation is rate limited', async (t) => {
  const f = await startForum({ MAX_POSTS_PER_HOUR: '2' });
  t.after(() => f.close());
  const c = await f.login('10000004');
  assert.equal((await c.post('/api/forum/posts', post())).status, 201);
  assert.equal((await c.post('/api/forum/posts', post())).status, 201);
  const r = await c.post('/api/forum/posts', post());
  assert.equal(r.status, 429);
  assert.equal(r.body.error.code, 'RATE_LIMITED');
});

test('member can reply; reply updates count and activity; duplicate request id is idempotent', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const c = await f.login('10000003');
  const before = (await c.get(`/api/forum/posts/${postId('machine_01')}`)).body;
  const rq = rid();
  const r = await c.post(`/api/forum/posts/${postId('machine_01')}/replies`, { requestId: rq, body: 'Check the coupling too.' });
  assert.equal(r.status, 201);
  const dup = await c.post(`/api/forum/posts/${postId('machine_01')}/replies`, { requestId: rq, body: 'Check the coupling too.' });
  assert.equal(dup.body.replyId, r.body.replyId);
  assert.equal(dup.body.duplicate, true);
  const after = (await c.get(`/api/forum/posts/${postId('machine_01')}`)).body;
  assert.equal(after.post.replyCount, before.post.replyCount + 1);
  assert.ok(after.post.lastActivityAt > before.post.lastActivityAt);
  assert.ok(after.replies.some((x) => x.id === r.body.replyId));

  assert.equal((await c.post(`/api/forum/posts/${postId('machine_01')}/replies`, { requestId: rid(), body: 'x'.repeat(401) })).status, 400);
  assert.equal((await c.post(`/api/forum/posts/${postId('machine_01')}/replies`, { requestId: rid(), body: ' ' })).status, 400);
  assert.equal((await c.post('/api/forum/posts/nope/replies', { requestId: rid(), body: 'hello there' })).status, 404);
});

test('replies nest one level only and are ordered accepted, score, oldest', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const c = await f.login('10000003');
  const parent = await c.post(`/api/forum/posts/${postId('crop_01')}/replies`, { requestId: rid(), body: 'Top level', parentReplyId: null });
  const child = await c.post(`/api/forum/posts/${postId('crop_01')}/replies`, { requestId: rid(), body: 'Nested once', parentReplyId: parent.body.replyId });
  assert.equal(child.status, 201);
  const deeper = await c.post(`/api/forum/posts/${postId('crop_01')}/replies`, { requestId: rid(), body: 'Too deep', parentReplyId: child.body.replyId });
  assert.equal(deeper.status, 400);
  const other = await c.post(`/api/forum/posts/${postId('machine_01')}/replies`, { requestId: rid(), body: 'Wrong post', parentReplyId: parent.body.replyId });
  assert.equal(other.status, 400);

  const { replies } = (await c.get(`/api/forum/posts/${postId('crop_01')}`)).body;
  assert.equal(replies[0].isAccepted, true);
  assert.equal(replies[0].score, 8);
  const tops = replies.filter((r) => r.depth === 0).map((r) => r.score);
  assert.deepEqual(tops, [...tops.slice(0, 1), ...[...tops.slice(1)].sort((a, b) => b - a)]);
  const idx = replies.findIndex((r) => r.id === parent.body.replyId);
  assert.equal(replies[idx + 1].id, child.body.replyId);
  assert.equal(replies[idx + 1].depth, 1);
});

test('voting toggles, switches and keeps score consistent; no self votes', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const c = await f.login('10000003');
  const vote = (value, id = postId('machine_01'), type = 'post') => c.put('/api/forum/votes', { targetType: type, targetId: id, value });
  const score = async () => (await c.get(`/api/forum/posts/${postId('machine_01')}`)).body;

  assert.equal((await score()).post.score, 17);
  let r = await vote(1);
  assert.deepEqual([r.body.vote, r.body.score], [1, 18]);
  assert.equal((await score()).viewer.vote, 1);
  r = await vote(1);
  assert.deepEqual([r.body.vote, r.body.score], [0, 17], 'same value removes the vote');
  r = await vote(-1);
  assert.deepEqual([r.body.vote, r.body.score], [-1, 16]);
  r = await vote(1);
  assert.deepEqual([r.body.vote, r.body.score], [1, 18], 'switching direction changes by 2');
  assert.equal((await f.pool.query(`SELECT COUNT(*)::int AS n FROM app.forum_votes WHERE user_id = (SELECT user_id FROM app.forum_user_state WHERE demo_key = '10000003') AND target_id = $1`, [postId('machine_01')])).rows[0].n, 1);

  const rv = await vote(1, replyId('machine_01', 1), 'reply');
  assert.deepEqual([rv.body.vote, rv.body.score], [1, 7]);
  assert.equal((await score()).replies.find((x) => x.id === replyId('machine_01', 1)).viewerVote, 1);

  assert.equal((await vote(5)).status, 400);
  assert.equal((await vote(0)).status, 400);
  assert.equal((await c.put('/api/forum/votes', { targetType: 'user', targetId: 'x', value: 1 })).status, 400);
  assert.equal((await vote(1, 'missing')).status, 404);

  const author = await f.login('10000002');
  const self = await author.put('/api/forum/votes', { targetType: 'post', targetId: postId('machine_01'), value: 1 });
  assert.equal(self.status, 403);
  assert.equal(self.body.error.code, 'FORBIDDEN');
});

test('the client cannot supply a score', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const c = await f.login('10000003');
  const r = await c.post('/api/forum/posts', { ...post(), score: 9999 });
  assert.equal(r.body.post.score, 0);
});

test('save and unsave are idempotent and feed My Saved', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const c = await f.login('10000003');
  assert.equal((await c.put(`/api/forum/posts/${postId('crop_01')}/save`)).body.saved, true);
  assert.equal((await c.put(`/api/forum/posts/${postId('crop_01')}/save`)).status, 200);
  assert.equal((await c.get(`/api/forum/posts/${postId('crop_01')}`)).body.viewer.saved, true);
  assert.deepEqual((await c.get('/api/forum/me/saved')).body.items.map((p) => p.id), [postId('crop_01')]);
  assert.equal((await c.del(`/api/forum/posts/${postId('crop_01')}/save`)).body.saved, false);
  assert.equal((await c.del(`/api/forum/posts/${postId('crop_01')}/save`)).status, 200);
  assert.equal((await c.get('/api/forum/me/saved')).body.items.length, 0);
});

test('report once per target; duplicates get a friendly error; moderators see the queue', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const c = await f.login('10000003');
  const rep = { targetType: 'post', targetId: postId('livestock_01'), reason: 'dangerous_advice', note: 'Dosage looks unsafe.' };
  assert.equal((await c.post('/api/forum/reports', rep)).status, 201);
  const dup = await c.post('/api/forum/reports', rep);
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'ALREADY_REPORTED');
  assert.equal((await c.post('/api/forum/reports', { ...rep, reason: 'nope' })).status, 400);
  assert.equal((await c.post('/api/forum/reports', { ...rep, targetId: 'missing' })).status, 404);
  assert.equal((await c.post('/api/forum/reports', { targetType: 'reply', targetId: replyId('crop_01', 2), reason: 'spam' })).status, 201);

  assert.equal((await c.get('/api/forum/reports')).status, 403);
  const mod = await f.login('10000005');
  const q = await mod.get('/api/forum/reports');
  assert.equal(q.body.items.length, 2);
});

test('notification count reflects replies to my posts until I mark them seen', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const ravi = await f.login('10000001');
  assert.equal((await ravi.get('/api/forum/me/notifications')).body.count, 4, 'three replies on crop_01 and one on market_01 from others');
  await ravi.post('/api/forum/me/notifications/seen');
  assert.equal((await ravi.get('/api/forum/me/notifications')).body.count, 0);
  await new Promise((r) => setTimeout(r, 5));
  const other = await f.login('10000003');
  await other.post(`/api/forum/posts/${postId('crop_01')}/replies`, { requestId: rid(), body: 'Any update on this?' });
  assert.equal((await ravi.get('/api/forum/me/notifications')).body.count, 1);
});

test('my posts lists only my visible posts', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const c = await f.login('10000001');
  const mine = (await c.get('/api/forum/me/posts')).body.items;
  assert.deepEqual(mine.map((p) => p.id).sort(), [postId('crop_01'), postId('market_01')]);
});

test('errors never leak SQL or stack traces', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const r = await f.client().get("/api/forum/posts/x'%20OR%201=1--");
  assert.equal(r.status, 404);
  assert.equal(r.body.ok, false);
  const unknown = await f.client().get('/api/forum/nothing-here');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'NOT_FOUND');
});

test('feed reads are rate limited per IP', async (t) => {
  const f = await startForum({ FEED_READS_PER_MINUTE: '3' });
  t.after(() => f.close());
  const g = f.client();
  for (let i = 0; i < 3; i++) assert.equal((await g.get('/api/forum/communities')).status, 200);
  assert.equal((await g.get('/api/forum/communities')).status, 429);
});

test('no AI/LLM dependency is used by the forum', async () => {
  const { readFileSync } = await import('node:fs');
  for (const d of ['routes/forum.js', 'services/forumService.js', 'services/authService.js', 'db/forumSeed.js']) {
    assert.ok(!/gemini|openai|anthropic|llm/i.test(readFileSync(new URL(`../${d}`, import.meta.url), 'utf8')), d);
  }
});
