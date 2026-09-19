import test from 'node:test';
import assert from 'node:assert/strict';
import { startForum, rid, postId, replyId } from './helpers.js';

test('only the author or a moderator can accept a solution; exactly one at a time; only questions', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const author = await f.login('10000002'); // wrote seed_post_machine_01 (question)
  const stranger = await f.login('10000003');
  const mod = await f.login('10000005');
  const put = (c, replyId, post = postId('machine_01')) => c.put(`/api/forum/posts/${post}/solution`, { replyId });
  const accepted = async () => (await author.get(`/api/forum/posts/${postId('machine_01')}`)).body;

  assert.equal((await put(stranger, replyId('machine_01', 1))).status, 403);
  assert.equal((await put(stranger, replyId('machine_01', 1))).body.error.code, 'FORBIDDEN');
  assert.equal((await accepted()).post.isSolved, false);

  assert.equal((await put(author, replyId('machine_01', 1))).status, 200);
  let d = await accepted();
  assert.equal(d.post.isSolved, true);
  assert.equal(d.replies[0].id, replyId('machine_01', 1));
  assert.equal(d.replies[0].isAccepted, true);
  assert.equal(d.viewer.canMarkSolved, true);

  // Choosing another reply replaces the first: still exactly one accepted reply.
  assert.equal((await put(mod, replyId('machine_01', 2))).status, 200);
  d = await accepted();
  assert.equal(d.replies.filter((r) => r.isAccepted).length, 1);
  assert.equal(d.replies[0].id, replyId('machine_01', 2));

  assert.equal((await put(author, replyId('crop_01', 1))).status, 400, 'reply from a different post');
  assert.equal((await put(author, 'missing')).status, 400);
  assert.equal((await put(author, replyId('crop_02', 1), postId('crop_02'))).status, 403, 'not the author of that post');

  // Discussion posts cannot be solved even by their author.
  const wrong = await author.put(`/api/forum/posts/${postId('crop_02')}/solution`, { replyId: replyId('crop_02', 1) });
  assert.ok([400, 403].includes(wrong.status));
  const disc = await (await f.login('10000003')).put(`/api/forum/posts/${postId('crop_02')}/solution`, { replyId: replyId('crop_02', 1) });
  assert.equal(disc.status, 400);
  assert.equal(disc.body.error.code, 'VALIDATION_ERROR');

  assert.equal((await stranger.del(`/api/forum/posts/${postId('machine_01')}/solution`)).status, 403);
  assert.equal((await author.del(`/api/forum/posts/${postId('machine_01')}/solution`)).status, 200);
  assert.equal((await accepted()).post.isSolved, false);
});

test('viewer permission flags reflect the caller', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const v = async (c, id = postId('machine_01')) => (await c.get(`/api/forum/posts/${id}`)).body.viewer;
  assert.deepEqual(
    { r: (await v(f.client())).canReply, s: (await v(f.client())).canMarkSolved, m: (await v(f.client())).canModerate },
    { r: false, s: false, m: false },
  );
  const author = await v(await f.login('10000002'));
  assert.equal(author.canReply, true);
  assert.equal(author.canMarkSolved, true);
  assert.equal(author.canModerate, false);
  const stranger = await v(await f.login('10000003'));
  assert.equal(stranger.canMarkSolved, false);
  const mod = await v(await f.login('10000005'));
  assert.equal(mod.canModerate, true);
  assert.equal(mod.canMarkSolved, true);
  // A discussion has no solution flow.
  assert.equal((await v(await f.login('10000003'), postId('crop_02'))).canMarkSolved, false);
});

test('locked post rejects replies and votes but stays readable', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const mod = await f.login('10000005');
  const member = await f.login('10000003');
  const lock = await mod.put(`/api/forum/posts/${postId('machine_01')}/moderation`, { isLocked: true, reason: 'Resolved elsewhere' });
  assert.equal(lock.status, 200);
  assert.equal(lock.body.post.isLocked, true);

  const detail = await member.get(`/api/forum/posts/${postId('machine_01')}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.replies.length, 2, 'existing content remains visible');
  assert.equal(detail.body.viewer.canReply, false);

  const reply = await member.post(`/api/forum/posts/${postId('machine_01')}/replies`, { requestId: rid(), body: 'Any more ideas?' });
  assert.equal(reply.status, 409);
  assert.equal(reply.body.error.code, 'POST_LOCKED');
  const vote = await member.put('/api/forum/votes', { targetType: 'post', targetId: postId('machine_01'), value: 1 });
  assert.equal(vote.body.error.code, 'POST_LOCKED');
  const replyVote = await member.put('/api/forum/votes', { targetType: 'reply', targetId: replyId('machine_01', 1), value: 1 });
  assert.equal(replyVote.body.error.code, 'POST_LOCKED');

  await mod.put(`/api/forum/posts/${postId('machine_01')}/moderation`, { isLocked: false });
  assert.equal((await member.post(`/api/forum/posts/${postId('machine_01')}/replies`, { requestId: rid(), body: 'Any more ideas?' })).status, 201);
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM app.forum_mod_actions')).rows[0].n, 2);
});

test('hidden content is absent from the public feed and reads as not found', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const mod = await f.login('10000005');
  const member = await f.login('10000003');
  const guest = f.client();
  await mod.put(`/api/forum/posts/${postId('market_01')}/moderation`, { isHidden: true });

  for (const c of [guest, member]) {
    const ids = (await c.get('/api/forum/posts?limit=20&sort=new')).body.items.map((p) => p.id);
    assert.ok(!ids.includes(postId('market_01')));
    assert.equal((await c.get(`/api/forum/posts/${postId('market_01')}`)).status, 404);
  }
  assert.equal((await member.put('/api/forum/votes', { targetType: 'post', targetId: postId('market_01'), value: 1 })).status, 404);
  assert.equal((await member.post(`/api/forum/posts/${postId('market_01')}/replies`, { requestId: rid(), body: 'hello there' })).status, 404);
  assert.equal((await member.put(`/api/forum/posts/${postId('market_01')}/save`)).status, 404);
  const communities = (await guest.get('/api/forum/communities')).body.items;
  assert.equal(communities.find((c) => c.slug === 'market-talk').postCount, 3);
  assert.equal((await mod.get(`/api/forum/posts/${postId('market_01')}`)).status, 200, 'moderators can still open it');

  // A hidden reply disappears too.
  await f.pool.query('UPDATE app.forum_replies SET is_hidden = true WHERE id = $1', [replyId('crop_01', 3)]);
  const d = (await guest.get(`/api/forum/posts/${postId('crop_01')}`)).body;
  assert.equal(d.replies.length, 2);
  assert.equal(d.post.replyCount, 2);
});

test('moderation actions require a moderator and record who did it', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const member = await f.login('10000003');
  const denied = await member.put(`/api/forum/posts/${postId('crop_01')}/moderation`, { isPinned: true });
  assert.equal(denied.status, 403);
  const mod = await f.login('10000005');
  assert.equal((await mod.put(`/api/forum/posts/${postId('crop_01')}/moderation`, {})).status, 400);
  const pin = await mod.put(`/api/forum/posts/${postId('crop_01')}/moderation`, { isPinned: true, reason: 'Useful thread' });
  assert.equal(pin.body.post.isPinned, true);
  const row = (await f.pool.query('SELECT action, reason FROM app.forum_mod_actions')).rows[0];
  assert.deepEqual(row, { action: 'isPinned:true', reason: 'Useful thread' });
});

test('a member cannot act as another user by sending ids in the body', async (t) => {
  const f = await startForum();
  t.after(() => f.close());
  const c = await f.login('10000003');
  const r = await c.post('/api/forum/posts', {
    requestId: rid(), type: 'discussion', community: 'farm-life', title: 'Spoof attempt title', body: 'Trying to spoof the author field.',
    tags: [], authorId: 'seed_user_10000005', author_id: 'seed_user_10000005', role: 'admin',
  });
  assert.equal(r.body.post.author.displayName, 'Minh Tran');
});
