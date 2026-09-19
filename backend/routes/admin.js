import express from 'express';
import { requireUser } from './auth.js';

function fail(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ ok: false, error: { code: err.code || 'INTERNAL', message: status >= 500 ? 'Something went wrong.' : err.message } });
}

function requireAdmin(auth) {
  const user = requireUser(auth);
  return [user, (req, res, next) => req.user.role === 'admin'
    ? next()
    : res.status(403).json({ ok: false, error: { code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' } })];
}

export function adminRouter({ auth, pool }) {
  const router = express.Router();
  const admin = requireAdmin(auth);

  router.get('/session', ...admin, (req, res) => res.json({ ok: true, user: req.user }));
  router.get('/users', ...admin, async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT u.id, u.status, u.role, u.created_at AS "createdAt", u.last_seen_at AS "lastSeenAt",
                p.display_name AS "displayName", p.village, p.language, r.name AS "regionName"
         FROM app.users u JOIN app.user_profiles p ON p.user_id=u.id JOIN app.regions r ON r.id=p.region_id
         ORDER BY u.created_at DESC LIMIT 200`,
      );
      res.json({ ok: true, users: result.rows });
    } catch (err) { fail(res, err); }
  });
  router.patch('/users/:id', ...admin, async (req, res) => {
    try {
      const { status } = req.body || {};
      if (!['active', 'suspended'].includes(status)) {
        return res.status(400).json({ ok: false, error: { code: 'INVALID_STATUS', message: 'Status must be active or suspended.' } });
      }
      if (req.params.id === req.user.id && status !== 'active') {
        return res.status(400).json({ ok: false, error: { code: 'SELF_SUSPEND', message: 'You cannot suspend your own account.' } });
      }
      const result = await pool.query('UPDATE app.users SET status=$2, updated_at=now() WHERE id=$1 RETURNING id, status', [req.params.id, status]);
      if (!result.rowCount) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'User was not found.' } });
      await pool.query('INSERT INTO app.admin_audit_log (actor_id,action,target_user_id,detail) VALUES ($1,$2,$3,$4)', [req.user.id, 'user_status_changed', req.params.id, JSON.stringify({ status })]);
      res.json({ ok: true, user: result.rows[0] });
    } catch (err) { fail(res, err); }
  });
  router.get('/catalog', ...admin, async (_req, res) => {
    try {
      const [regions, crops, settings] = await Promise.all([
        pool.query('SELECT id, code, country_code AS "countryCode", name FROM app.regions ORDER BY name'),
        pool.query('SELECT id, code, name, active FROM app.crops ORDER BY name'),
        pool.query('SELECT key, value, updated_at AS "updatedAt" FROM app.app_settings ORDER BY key'),
      ]);
      res.json({ ok: true, regions: regions.rows, crops: crops.rows, settings: settings.rows });
    } catch (err) { fail(res, err); }
  });
  router.put('/settings/:key', ...admin, async (req, res) => {
    try {
      const { key } = req.params;
      let value;
      if (key === 'maintenance_mode') {
        if (typeof req.body?.value !== 'boolean') throw Object.assign(new Error('Maintenance mode must be true or false.'), { status: 400 });
        value = req.body.value;
      } else if (key === 'welcome_message') {
        value = String(req.body?.value ?? '').trim().slice(0, 160);
      } else throw Object.assign(new Error('This setting cannot be changed.'), { status: 404 });
      await pool.query('UPDATE app.app_settings SET value=$2::jsonb, updated_by=$3, updated_at=now() WHERE key=$1', [key, JSON.stringify(value), req.user.id]);
      await pool.query('INSERT INTO app.admin_audit_log (actor_id,action,detail) VALUES ($1,$2,$3)', [req.user.id, 'setting_changed', JSON.stringify({ key, value })]);
      res.json({ ok: true, key, value });
    } catch (err) { fail(res, err); }
  });
  return router;
}
