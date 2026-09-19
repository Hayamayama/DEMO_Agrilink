import crypto from 'node:crypto';
import { AppError, validation } from '../middleware/errors.js';
import { tooMany } from '../middleware/rateLimits.js';
import { POST_TYPES, REPORT_REASONS, DEFAULT_GUEST_REGION } from './forumMeta.js';
import { cleanTitle, cleanBody, cleanNote, cleanRequestId } from './forumValidation.js';
import { isConfigured, translateText } from './geminiProvider.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isModerator = (u) => Boolean(u && (u.role === 'moderator' || u.role === 'admin'));
const iso = (d) => (d instanceof Date ? d.toISOString() : d);
const notFound = (what = 'Post') => new AppError('NOT_FOUND', `${what} not found.`);

// Ids arrive from URLs; a malformed one is simply "not found", never a database error.
const uuid = (v, what) => { if (typeof v !== 'string' || !UUID.test(v)) throw notFound(what); return v.toLowerCase(); };

const SCORE = (type, alias) => `COALESCE((SELECT SUM(v.value) FROM app.forum_votes v WHERE v.target_type = '${type}' AND v.target_id = ${alias}.id), 0)::int`;

const POST_SELECT = `
  SELECT p.*, c.slug AS community_slug, c.name AS community_name,
         up.display_name AS author_name, ar.code AS author_region_code,
         u.is_verified_expert, u.expert_title,
         r.code AS region_code, r.name AS region_name, r.country_code,
         ${SCORE('post', 'p')} AS score,
         (SELECT COUNT(*) FROM app.forum_replies x WHERE x.post_id = p.id AND NOT x.is_hidden)::int AS reply_count
  FROM app.forum_posts p
  JOIN app.forum_communities c ON c.id = p.community_id
  JOIN app.regions r ON r.id = p.region_id
  JOIN app.user_profiles up ON up.user_id = p.author_id
  JOIN app.users u ON u.id = p.author_id
  LEFT JOIN app.regions ar ON ar.id = up.region_id`;

export function createForumService({ pool, limiter, config }) {
  const q = (text, params) => pool.query(text, params);

  async function tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally { client.release(); }
  }

  // ---------- serialisation ----------
  async function tagsFor(postIds) {
    const map = new Map(postIds.map((id) => [id, []]));
    if (!postIds.length) return map;
    const { rows } = await q(`SELECT pt.post_id, t.slug FROM app.forum_post_tags pt JOIN app.forum_tags t ON t.id = pt.tag_id
      WHERE pt.post_id = ANY($1::uuid[]) ORDER BY t.slug`, [postIds]);
    for (const r of rows) map.get(r.post_id).push(r.slug);
    return map;
  }

  function serializePost(row, tags, { withBody = false } = {}) {
    const out = {
      id: row.id,
      type: row.type,
      title: row.title,
      community: { slug: row.community_slug, name: row.community_name },
      tags: tags || [],
      author: { displayName: row.author_name, regionCode: row.author_region_code,
        isVerifiedExpert: Boolean(row.is_verified_expert), expertTitle: row.expert_title || null },
      language: row.language,
      countryCode: row.country_code,
      regionCode: row.region_code,
      locationScope: row.location_scope,
      locationLabel: row.location_scope === 'country' ? row.country_code : row.region_name,
      score: row.score,
      replyCount: row.reply_count,
      isSolved: Boolean(row.accepted_reply_id),
      isPinned: row.is_pinned,
      isLocked: row.is_locked,
      isHidden: row.is_hidden,
      isDemo: row.is_demo,
      createdAt: iso(row.created_at),
      lastActivityAt: iso(row.last_activity_at),
    };
    if (withBody) { out.body = row.body; out.acceptedReplyId = row.accepted_reply_id || null; out.hasImage = Boolean(row.image_path); }
    return out;
  }

  async function serializeRows(rows, opts) {
    const tags = await tagsFor(rows.map((r) => r.id));
    return rows.map((r) => serializePost(r, tags.get(r.id), opts));
  }

  async function postById(id, db = pool) {
    const { rows } = await db.query(`${POST_SELECT} WHERE p.id = $1`, [id]);
    return rows[0] || null;
  }

  // ---------- helpers ----------
  async function findVisiblePost(rawId, viewer, db = pool) {
    const row = await postById(uuid(rawId), db);
    if (!row || (row.is_hidden && !isModerator(viewer))) throw notFound();
    return row;
  }

  async function idempotent(user, requestId, kind) {
    const { rows } = await q('SELECT kind, result_id FROM app.forum_request_ids WHERE user_id = $1 AND request_id = $2', [user.id, requestId]);
    if (!rows[0]) return null;
    if (rows[0].kind !== kind) throw new AppError('DUPLICATE_REQUEST', 'This request id was already used.');
    return rows[0].result_id;
  }

  const remember = (db, user, requestId, kind, resultId) =>
    db.query('INSERT INTO app.forum_request_ids (user_id, request_id, kind, result_id) VALUES ($1, $2, $3, $4)', [user.id, requestId, kind, resultId]);

  function assertActive(user) {
    if (user.status !== 'active') throw new AppError('ACCOUNT_SUSPENDED', 'This account is not active.');
  }

  // ---------- metadata ----------
  async function listCommunities() {
    const { rows } = await q(`SELECT c.slug, c.name, c.description, c.sort_order,
      (SELECT COUNT(*) FROM app.forum_posts p WHERE p.community_id = c.id AND NOT p.is_hidden)::int AS post_count
      FROM app.forum_communities c WHERE c.is_active ORDER BY c.sort_order`);
    return rows.map((c) => ({ slug: c.slug, name: c.name, description: c.description, order: c.sort_order, postCount: c.post_count }));
  }

  async function listTags(communitySlug) {
    if (communitySlug && !(await q('SELECT 1 FROM app.forum_communities WHERE slug = $1', [communitySlug])).rowCount) {
      throw validation('Unknown community.', 'community');
    }
    const { rows } = await q(`SELECT t.slug, t.label, c.slug AS community FROM app.forum_tags t
      LEFT JOIN app.forum_communities c ON c.id = t.community_id WHERE t.is_active ORDER BY t.slug`);
    // Tags belonging to the chosen community come first; the rest follow.
    rows.sort((a, b) => Number(b.community === communitySlug) - Number(a.community === communitySlug));
    return rows.map((t) => ({ slug: t.slug, label: t.label, community: t.community }));
  }

  async function listRegions() {
    const { rows } = await q('SELECT code, name, country_code FROM app.regions ORDER BY name');
    return rows.map((r) => ({ code: r.code, name: r.name, countryCode: r.country_code }));
  }

  // ---------- feed ----------
  function decodeCursor(c) {
    if (!c) return 0;
    try {
      const o = JSON.parse(Buffer.from(String(c), 'base64url').toString());
      if (Number.isInteger(o.o) && o.o >= 0 && o.o < 5000) return o.o;
    } catch { /* fall through */ }
    throw validation('Invalid cursor.', 'cursor');
  }
  const encodeCursor = (o) => Buffer.from(JSON.stringify({ o })).toString('base64url');

  async function listPosts(viewer, query = {}) {
    const sort = query.sort || 'local';
    if (!['local', 'new', 'top'].includes(sort)) throw validation('Unknown sort.', 'sort');
    const scope = query.scope || 'global';
    if (!['region', 'country', 'global'].includes(scope)) throw validation('Unknown scope.', 'scope');
    if (query.type && !POST_TYPES.includes(query.type)) throw validation('Unknown post type.', 'type');
    if (query.status && !['open', 'solved'].includes(query.status)) throw validation('Unknown status.', 'status');
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 20);
    const offset = decodeCursor(query.cursor);

    // Signed-in members use their profile region; guests may pass a browsing region code.
    let regionCode = viewer?.regionCode;
    let countryCode = viewer?.countryCode;
    if (!viewer) {
      const want = typeof query.region === 'string' ? query.region : DEFAULT_GUEST_REGION;
      const found = (await q('SELECT code, country_code FROM app.regions WHERE code = $1', [want])).rows[0]
        || (await q('SELECT code, country_code FROM app.regions ORDER BY code LIMIT 1')).rows[0];
      regionCode = found?.code; countryCode = found?.country_code;
    }

    const params = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };
    // Parameters are added only when used: Postgres rejects a parameter it cannot type.
    let regionRef = null, countryRef = null;
    const region = () => (regionRef ??= `${p(regionCode ?? '')}::text`);
    const country = () => (countryRef ??= `${p(countryCode ?? '')}::text`);
    const where = ['NOT p.is_hidden', 'c.is_active'];
    if (query.community) where.push(`c.slug = ${p(String(query.community))}`);
    if (query.tag) where.push(`EXISTS (SELECT 1 FROM app.forum_post_tags pt JOIN app.forum_tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.slug = ${p(String(query.tag))})`);
    if (query.type) where.push(`p.type = ${p(query.type)}`);
    if (query.status === 'solved') where.push('p.accepted_reply_id IS NOT NULL');
    if (query.status === 'open') where.push("p.type = 'question' AND p.accepted_reply_id IS NULL");
    if (scope === 'region') where.push(`r.code = ${region()}`);
    if (scope === 'country') where.push(`r.country_code = ${country()}`);

    // The list is wrapped in a subquery so ORDER BY can use the computed score/reply_count;
    // outside the wrapper the region columns are region_code / country_code.
    let order;
    if (sort === 'new') order = 'p.is_pinned DESC, p.created_at DESC';
    else if (sort === 'top') {
      where.push(`(p.is_pinned OR p.created_at >= now() - interval '7 days')`);
      order = 'p.is_pinned DESC, p.score DESC, p.reply_count DESC, p.last_activity_at DESC';
    } else {
      order = `CASE WHEN p.region_code = ${region()} THEN 0 WHEN p.country_code = ${country()} THEN 1 ELSE 2 END, p.is_pinned DESC, p.last_activity_at DESC`;
    }
    const sql = `SELECT * FROM (${POST_SELECT} WHERE ${where.join(' AND ')}) p ORDER BY ${order}, p.id LIMIT ${p(limit + 1)} OFFSET ${p(offset)}`;
    const { rows } = await q(sql, params);
    const more = rows.length > limit;
    return { items: await serializeRows(rows.slice(0, limit)), nextCursor: more ? encodeCursor(offset + limit) : null };
  }

  // ---------- detail ----------
  async function translation(sourceType, sourceId, sourceLang, targetLang, original) {
    if (!targetLang || targetLang === sourceLang || !['en','hi'].includes(targetLang)) return null;
    const cached = (await q(`SELECT translated_text FROM app.translations_cache
      WHERE source_type=$1 AND source_id=$2 AND target_lang=$3`, [sourceType, sourceId, targetLang])).rows[0];
    if (cached) return { ...JSON.parse(cached.translated_text), targetLang, isTranslated: true };
    if (!isConfigured()) return null;
    const translated = {};
    for (const [key, value] of Object.entries(original)) translated[key] = await translateText({ text: value, sourceLang, targetLang });
    await q(`INSERT INTO app.translations_cache(source_type,source_id,target_lang,translated_text) VALUES($1,$2,$3,$4)
      ON CONFLICT(source_type,source_id,target_lang) DO UPDATE SET translated_text=EXCLUDED.translated_text,created_at=now()`,
    [sourceType, sourceId, targetLang, JSON.stringify(translated)]);
    return { ...translated, targetLang, isTranslated: true };
  }

  async function getPost(viewer, rawId, targetLang = null) {
    const row = await findVisiblePost(rawId, viewer);
    const tags = (await tagsFor([row.id])).get(row.id);
    const post = serializePost(row, tags, { withBody: true });

    post.translation = await translation('post', row.id, row.language, targetLang, { title: row.title, body: row.body });
    const { rows: replyRows } = await q(`SELECT r.*, up.display_name AS author_name, rg.code AS author_region_code,
      u.is_verified_expert,u.expert_title, ${SCORE('reply', 'r')} AS score
      FROM app.forum_replies r JOIN app.user_profiles up ON up.user_id = r.author_id JOIN app.users u ON u.id=r.author_id LEFT JOIN app.regions rg ON rg.id = up.region_id
      WHERE r.post_id = $1 AND NOT r.is_hidden`, [row.id]);
    const myVotes = new Map();
    let vote = 0, saved = false;
    if (viewer) {
      const votes = await q(`SELECT target_type, target_id, value FROM app.forum_votes WHERE user_id = $1
        AND ((target_type = 'reply' AND target_id IN (SELECT id FROM app.forum_replies WHERE post_id = $2)) OR (target_type = 'post' AND target_id = $2))`, [viewer.id, row.id]);
      for (const v of votes.rows) { if (v.target_type === 'reply') myVotes.set(v.target_id, v.value); else vote = v.value; }
      saved = (await q('SELECT 1 FROM app.forum_saved_posts WHERE user_id = $1 AND post_id = $2', [viewer.id, row.id])).rowCount > 0;
    }
    const shape = (r, depth) => ({
      id: r.id,
      postId: r.post_id,
      parentReplyId: r.parent_reply_id,
      depth,
      body: r.body,
      author: { displayName: r.author_name, regionCode: r.author_region_code,
        isVerifiedExpert: Boolean(r.is_verified_expert), expertTitle: r.expert_title || null },
      language: r.language,
      source: r.source,
      score: r.score,
      viewerVote: myVotes.get(r.id) || 0,
      isAccepted: r.id === row.accepted_reply_id,
      isEdited: r.updated_at > r.created_at,
      createdAt: iso(r.created_at),
    });
    // Accepted first, then score, then oldest. Children (one level only) follow their parent, oldest first.
    const time = (r) => r.created_at.getTime();
    const sourceRank = { expert: 0, official: 1, human: 2, ai: 3 };
    const tops = replyRows.filter((r) => !r.parent_reply_id).sort((a, b) =>
      (b.id === row.accepted_reply_id) - (a.id === row.accepted_reply_id) || sourceRank[a.source] - sourceRank[b.source]
      || b.score - a.score || time(a) - time(b) || a.id.localeCompare(b.id));
    const replies = [];
    for (const t of tops) {
      const shaped = shape(t, 0);
      shaped.translation = await translation('reply', t.id, t.language, targetLang, { body: t.body });
      replies.push(shaped);
      replyRows.filter((r) => r.parent_reply_id === t.id).sort((a, b) => time(a) - time(b)).forEach((c) => replies.push(shape(c, 1)));
    }

    const authed = Boolean(viewer);
    const isAuthor = authed && viewer.id === row.author_id;
    return {
      post,
      replies,
      viewer: {
        authenticated: authed,
        vote,
        saved,
        isAuthor,
        canReply: authed && !row.is_locked && !row.is_hidden,
        canModerate: isModerator(viewer),
        canMarkSolved: authed && row.type === 'question' && (isAuthor || isModerator(viewer)),
      },
    };
  }

  // ---------- writes ----------
  async function createPost(user, input) {
    assertActive(user);
    const i = input || {};
    const requestId = cleanRequestId(i.requestId);
    const existing = await idempotent(user, requestId, 'post');
    if (existing) return { post: (await serializeRows([await postById(existing)], { withBody: true }))[0], duplicate: true };

    if (!POST_TYPES.includes(i.type)) throw validation('Choose a post type.', 'type');
    const community = (await q('SELECT id FROM app.forum_communities WHERE slug = $1 AND is_active', [String(i.community)])).rows[0];
    if (!community) throw validation('Choose a community.', 'community');
    const title = cleanTitle(i.title);
    const body = cleanBody(i.body, { field: 'body', min: 10, max: 500, paragraphs: 4 });
    const tagSlugs = [...new Set(Array.isArray(i.tags) ? i.tags.map(String) : [])];
    if (tagSlugs.length > 2) throw validation('Choose at most two tags.', 'tags');
    const tagRows = tagSlugs.length ? (await q('SELECT id FROM app.forum_tags WHERE is_active AND slug = ANY($1::text[])', [tagSlugs])).rows : [];
    if (tagRows.length !== tagSlugs.length) throw validation('Unknown tag.', 'tags');
    const scope = i.locationScope ?? 'region';
    if (!['region', 'country'].includes(scope)) throw validation('Choose a location.', 'locationScope');

    const recent = (await q(`SELECT COUNT(*)::int AS n FROM app.forum_posts WHERE author_id = $1 AND created_at > now() - interval '1 hour'`, [user.id])).rows[0].n;
    if (recent >= config.maxPostsPerHour) throw tooMany('posts', HOUR);

    const id = await tx(async (db) => {
      const language = ['en','hi'].includes(i.language) ? i.language : 'en';
      const { rows } = await db.query(`INSERT INTO app.forum_posts (author_id, community_id, region_id, type, title, body, location_scope,language)
        VALUES ($1, $2, $3, $4, $5, $6, $7,$8) RETURNING id`, [user.id, community.id, user.regionId, i.type, title, body, scope,language]);
      const postId = rows[0].id;
      for (const t of tagRows) await db.query('INSERT INTO app.forum_post_tags (post_id, tag_id) VALUES ($1, $2)', [postId, t.id]);
      await remember(db, user, requestId, 'post', postId);
      return postId;
    });
    return { post: (await serializeRows([await postById(id)], { withBody: true }))[0], duplicate: false };
  }

  async function createReply(user, rawPostId, input) {
    assertActive(user);
    const i = input || {};
    const requestId = cleanRequestId(i.requestId);
    const existing = await idempotent(user, requestId, 'reply');
    if (existing) return { replyId: existing, duplicate: true };

    const post = await findVisiblePost(rawPostId, user);
    if (post.is_locked) throw new AppError('POST_LOCKED', 'This post is locked.');
    const body = cleanBody(i.body, { field: 'body', min: 2, max: 400, paragraphs: 3 });
    let parentId = null;
    if (i.parentReplyId) {
      if (typeof i.parentReplyId !== 'string' || !UUID.test(i.parentReplyId)) throw validation('Reply not found.', 'parentReplyId');
      const parent = (await q('SELECT id, post_id, parent_reply_id, is_hidden FROM app.forum_replies WHERE id = $1', [i.parentReplyId.toLowerCase()])).rows[0];
      if (!parent || parent.post_id !== post.id || parent.is_hidden) throw validation('Reply not found.', 'parentReplyId');
      if (parent.parent_reply_id) throw validation('Replies can only be nested one level.', 'parentReplyId');
      parentId = parent.id;
    }
    const recent = (await q(`SELECT COUNT(*)::int AS n FROM app.forum_replies WHERE author_id = $1 AND created_at > now() - interval '1 hour'`, [user.id])).rows[0].n;
    if (recent >= config.maxRepliesPerHour) throw tooMany('replies', HOUR);

    const id = await tx(async (db) => {
      const language = ['en','hi'].includes(i.language) ? i.language : 'en';
      const source = user.isVerifiedExpert ? 'expert' : 'human';
      const { rows } = await db.query('INSERT INTO app.forum_replies (post_id, author_id, parent_reply_id, body,language,source) VALUES ($1, $2, $3, $4,$5,$6) RETURNING id',
        [post.id, user.id, parentId, body,language,source]);
      await db.query('UPDATE app.forum_posts SET last_activity_at = now(), updated_at = now() WHERE id = $1', [post.id]);
      await remember(db, user, requestId, 'reply', rows[0].id);
      return rows[0].id;
    });
    return { replyId: id, duplicate: false };
  }

  async function vote(user, { targetType, targetId, value } = {}) {
    assertActive(user);
    if (!['post', 'reply'].includes(targetType)) throw validation('Unknown target.', 'targetType');
    if (value !== 1 && value !== -1) throw validation('Vote must be 1 or -1.', 'value');
    const id = uuid(targetId, targetType === 'post' ? 'Post' : 'Reply');
    let post, authorId;
    if (targetType === 'post') {
      post = await findVisiblePost(id, user);
      authorId = post.author_id;
    } else {
      const r = (await q('SELECT id, post_id, author_id, is_hidden FROM app.forum_replies WHERE id = $1', [id])).rows[0];
      if (!r || r.is_hidden) throw notFound('Reply');
      post = await findVisiblePost(r.post_id, user);
      authorId = r.author_id;
    }
    if (post.is_hidden) throw notFound();
    if (authorId === user.id) throw new AppError('FORBIDDEN', 'You cannot vote on your own post.');
    if (post.is_locked) throw new AppError('POST_LOCKED', 'This post is locked.');
    limiter.hit(`vote:${user.id}`, config.votesPerMinute, 60000, 'votes');

    return tx(async (db) => {
      const cur = (await db.query('SELECT value FROM app.forum_votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3 FOR UPDATE', [user.id, targetType, id])).rows[0];
      let next = value;
      if (cur && cur.value === value) {
        await db.query('DELETE FROM app.forum_votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3', [user.id, targetType, id]);
        next = 0;
      } else if (cur) {
        await db.query('UPDATE app.forum_votes SET value = $4, updated_at = now() WHERE user_id = $1 AND target_type = $2 AND target_id = $3', [user.id, targetType, id, value]);
      } else {
        await db.query('INSERT INTO app.forum_votes (user_id, target_type, target_id, value) VALUES ($1, $2, $3, $4)', [user.id, targetType, id, value]);
      }
      const score = (await db.query('SELECT COALESCE(SUM(value), 0)::int AS s FROM app.forum_votes WHERE target_type = $1 AND target_id = $2', [targetType, id])).rows[0].s;
      return { vote: next, score };
    });
  }

  async function setSaved(user, rawPostId, saved) {
    assertActive(user);
    const post = await findVisiblePost(rawPostId, user);
    if (saved) await q('INSERT INTO app.forum_saved_posts (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, post.id]);
    else await q('DELETE FROM app.forum_saved_posts WHERE user_id = $1 AND post_id = $2', [user.id, post.id]);
    return { saved };
  }

  async function report(user, input) {
    assertActive(user);
    const i = input || {};
    if (!['post', 'reply'].includes(i.targetType)) throw validation('Unknown target.', 'targetType');
    if (!REPORT_REASONS.includes(i.reason)) throw validation('Choose a reason.', 'reason');
    const note = cleanNote(i.note);
    const targetId = uuid(i.targetId, 'Content');
    const table = i.targetType === 'post' ? 'app.forum_posts' : 'app.forum_replies';
    if (!(await q(`SELECT 1 FROM ${table} WHERE id = $1 AND NOT is_hidden`, [targetId])).rowCount) throw notFound('Content');
    if ((await q('SELECT 1 FROM app.forum_reports WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3', [user.id, i.targetType, targetId])).rowCount) {
      throw new AppError('ALREADY_REPORTED', 'You already reported this. Thank you.');
    }
    const today = (await q(`SELECT COUNT(*)::int AS n FROM app.forum_reports WHERE reporter_id = $1 AND created_at > now() - interval '1 day'`, [user.id])).rows[0].n;
    if (today >= config.reportsPerDay) throw tooMany('reports', DAY);
    try {
      await q('INSERT INTO app.forum_reports (reporter_id, target_type, target_id, reason, note) VALUES ($1, $2, $3, $4, $5)', [user.id, i.targetType, targetId, i.reason, note]);
    } catch (e) {
      if (e.code === '23505') throw new AppError('ALREADY_REPORTED', 'You already reported this. Thank you.');
      throw e;
    }
    return { reported: true };
  }

  const canManageSolution = (user, post) => post.author_id === user.id || isModerator(user);

  async function setSolution(user, rawPostId, replyId) {
    assertActive(user);
    return tx(async (db) => {
      const id = uuid(rawPostId, 'Post');
      const post = (await db.query('SELECT * FROM app.forum_posts WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!post || (post.is_hidden && !isModerator(user))) throw notFound();
      if (!canManageSolution(user, post)) throw new AppError('FORBIDDEN', 'Only the author can mark a solution.');
      if (post.type !== 'question') throw validation('Only questions can be solved.', 'replyId');
      const rid = typeof replyId === 'string' && UUID.test(replyId) ? replyId.toLowerCase() : null;
      const r = rid && (await db.query('SELECT id, post_id, is_hidden FROM app.forum_replies WHERE id = $1', [rid])).rows[0];
      if (!r || r.post_id !== post.id || r.is_hidden) throw validation('Choose a reply on this post.', 'replyId');
      await db.query('UPDATE app.forum_posts SET accepted_reply_id = $2, updated_at = now() WHERE id = $1', [post.id, r.id]);
      return { acceptedReplyId: r.id };
    });
  }

  async function clearSolution(user, rawPostId) {
    assertActive(user);
    return tx(async (db) => {
      const post = (await db.query('SELECT * FROM app.forum_posts WHERE id = $1 FOR UPDATE', [uuid(rawPostId, 'Post')])).rows[0];
      if (!post || (post.is_hidden && !isModerator(user))) throw notFound();
      if (!canManageSolution(user, post)) throw new AppError('FORBIDDEN', 'Only the author can change the solution.');
      await db.query('UPDATE app.forum_posts SET accepted_reply_id = NULL, updated_at = now() WHERE id = $1', [post.id]);
      return { acceptedReplyId: null };
    });
  }

  async function moderate(user, rawPostId, input) {
    assertActive(user);
    if (!isModerator(user)) throw new AppError('FORBIDDEN', 'Moderators only.');
    const post = await findVisiblePost(rawPostId, user);
    const i = input || {};
    const reason = i.reason == null ? null : cleanNote(i.reason);
    const map = { isPinned: 'is_pinned', isLocked: 'is_locked', isHidden: 'is_hidden' };
    const changes = Object.keys(map).filter((k) => typeof i[k] === 'boolean');
    if (!changes.length) throw validation('Nothing to change.');
    await tx(async (db) => {
      for (const k of changes) {
        await db.query(`UPDATE app.forum_posts SET ${map[k]} = $2, updated_at = now() WHERE id = $1`, [post.id, i[k]]);
        await db.query('INSERT INTO app.forum_mod_actions (moderator_id, post_id, action, reason) VALUES ($1, $2, $3, $4)', [user.id, post.id, `${k}:${i[k]}`, reason]);
      }
    });
    return { post: (await serializeRows([await postById(post.id)], { withBody: true }))[0] };
  }

  async function listReports(user) {
    if (!isModerator(user)) throw new AppError('FORBIDDEN', 'Moderators only.');
    const { rows } = await q(`SELECT r.id, r.target_type, r.target_id, r.reason, r.note, r.status, r.created_at, up.display_name AS reporter
      FROM app.forum_reports r JOIN app.user_profiles up ON up.user_id = r.reporter_id WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 50`);
    return rows.map((r) => ({ id: r.id, targetType: r.target_type, targetId: r.target_id, reason: r.reason, note: r.note, status: r.status, reporter: r.reporter, createdAt: iso(r.created_at) }));
  }

  // ---------- personal collections ----------
  async function myPosts(user) {
    const { rows } = await q(`${POST_SELECT} WHERE p.author_id = $1 AND NOT p.is_hidden ORDER BY p.created_at DESC LIMIT 30`, [user.id]);
    return serializeRows(rows);
  }

  async function savedPosts(user) {
    const { rows } = await q(`${POST_SELECT} JOIN app.forum_saved_posts sp ON sp.post_id = p.id AND sp.user_id = $1
      WHERE NOT p.is_hidden ORDER BY sp.created_at DESC LIMIT 30`, [user.id]);
    return serializeRows(rows);
  }

  // Replies by other people to my posts since I last opened My Posts.
  async function notificationCount(user) {
    const { rows } = await q(`SELECT COUNT(*)::int AS n FROM app.forum_replies r JOIN app.forum_posts p ON p.id = r.post_id
      WHERE p.author_id = $1 AND r.author_id <> $1 AND NOT r.is_hidden
        AND r.created_at > COALESCE((SELECT notifications_seen_at FROM app.forum_user_state WHERE user_id = $1), 'epoch'::timestamptz)`, [user.id]);
    return rows[0].n;
  }

  async function markNotificationsSeen(user) {
    await q(`INSERT INTO app.forum_user_state (user_id, notifications_seen_at) VALUES ($1, now())
      ON CONFLICT (user_id) DO UPDATE SET notifications_seen_at = now()`, [user.id]);
    return { count: 0 };
  }

  return {
    listCommunities, listTags, listRegions, listPosts, getPost, createPost, createReply, vote, setSaved, report,
    setSolution, clearSolution, moderate, listReports, myPosts, savedPosts, notificationCount, markNotificationsSeen,
  };
}
