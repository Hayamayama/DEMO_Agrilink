import express, { Router } from 'express';
import { sessionFromRequest } from './auth.js';
import { AppError, asyncHandler, forumNotFound } from '../middleware/errors.js';
import { limitByIp, createLimiter } from '../middleware/rateLimits.js';
import { createForumService } from '../services/forumService.js';

const int = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

export function loadForumConfig(env = process.env) {
  return {
    maxPostsPerHour: int(env.MAX_POSTS_PER_HOUR, 5),
    maxRepliesPerHour: int(env.MAX_REPLIES_PER_HOUR, 20),
    votesPerMinute: int(env.VOTES_PER_MINUTE, 60),
    reportsPerDay: int(env.REPORTS_PER_DAY, 10),
    readsPerMinute: int(env.FEED_READS_PER_MINUTE, 120),
  };
}

// Cookies are SameSite=Lax; on top of that, reject browser-originated writes whose
// Origin does not match the host we were reached on.
function sameOriginWrites(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    let host = null;
    try { host = new URL(origin).host; } catch { /* fallthrough */ }
    const allowed = [req.headers.host, req.headers['x-forwarded-host']].filter(Boolean);
    if (!host || !allowed.includes(host)) return next(new AppError('FORBIDDEN', 'Cross-site request blocked.'));
  }
  next();
}

// The forum reuses the app-wide identity (routes/auth.js + services/authService.js): `auth.session(token)`
// resolves the HttpOnly cookie to the profile. Reading is public; writes need a member.
export function createForumRouter({ pool, auth, config = loadForumConfig() }) {
  const limiter = createLimiter();
  const forum = createForumService({ pool, limiter, config });
  const json = express.json({ limit: '8kb' });
  const router = Router();

  router.use(sameOriginWrites);
  router.use((req, res, next) => (req.method === 'GET' ? (res.set('Cache-Control', 'no-store'), next()) : next()));

  router.use(asyncHandler(async (req, _res, next) => {
    req.user = null;
    const token = sessionFromRequest(req);
    const profile = token ? await auth.session(token) : null;
    if (profile) {
      const r = (await pool.query('SELECT code, country_code FROM app.regions WHERE id = $1', [profile.regionId])).rows[0];
      req.user = { ...profile, regionCode: r?.code ?? null, countryCode: r?.country_code ?? null };
    }
    next();
  }));

  const reads = limitByIp(limiter, 'read', config.readsPerMinute, 60000, 'requests');
  const need = (message) => (req, _res, next) => next(req.user ? undefined : new AppError('AUTH_REQUIRED', message));
  const write = (message) => [json, need(message)];
  const send = (fn, status = 200) => asyncHandler(async (req, res) => {
    const out = await fn(req);
    res.status(typeof status === 'function' ? status(out) : status).json({ ok: true, ...out });
  });

  router.get('/communities', reads, send(async () => ({ items: await forum.listCommunities() })));
  router.get('/regions', reads, send(async () => ({ items: await forum.listRegions() })));
  router.get('/tags', reads, send(async (req) => ({ items: await forum.listTags(req.query.community ? String(req.query.community) : null) })));
  router.get('/posts', reads, send((req) => forum.listPosts(req.user, req.query)));
  router.get('/posts/:id', reads, send((req) => forum.getPost(req.user, req.params.id)));

  router.post('/posts', ...write('Sign in to post.'), send((req) => forum.createPost(req.user, req.body), (o) => (o.duplicate ? 200 : 201)));
  router.post('/posts/:id/replies', ...write('Sign in to reply.'), send((req) => forum.createReply(req.user, req.params.id, req.body), (o) => (o.duplicate ? 200 : 201)));
  router.put('/votes', ...write('Sign in to vote.'), send((req) => forum.vote(req.user, req.body || {})));
  router.put('/posts/:id/save', need('Sign in to save.'), send((req) => forum.setSaved(req.user, req.params.id, true)));
  router.delete('/posts/:id/save', need('Sign in to save.'), send((req) => forum.setSaved(req.user, req.params.id, false)));
  router.post('/reports', ...write('Sign in to report.'), send((req) => forum.report(req.user, req.body), 201));
  router.get('/reports', need('Sign in as a moderator.'), send(async (req) => ({ items: await forum.listReports(req.user) })));
  router.put('/posts/:id/solution', ...write('Sign in to mark a solution.'), send((req) => forum.setSolution(req.user, req.params.id, req.body?.replyId)));
  router.delete('/posts/:id/solution', need('Sign in to change the solution.'), send((req) => forum.clearSolution(req.user, req.params.id)));
  router.put('/posts/:id/moderation', ...write('Sign in as a moderator.'), send((req) => forum.moderate(req.user, req.params.id, req.body)));

  router.get('/me/posts', need('Sign in to see your posts.'), send(async (req) => ({ items: await forum.myPosts(req.user) })));
  router.get('/me/saved', need('Sign in to see saved posts.'), send(async (req) => ({ items: await forum.savedPosts(req.user) })));
  router.get('/me/notifications', need('Sign in.'), send(async (req) => ({ count: await forum.notificationCount(req.user) })));
  router.post('/me/notifications/seen', need('Sign in.'), send((req) => forum.markNotificationsSeen(req.user)));
  router.use(forumNotFound);

  const timer = setInterval(() => limiter.sweep(), 3600000);
  timer.unref();
  return { router, service: forum, close: () => clearInterval(timer) };
}
