import express from 'express';
import { requireUser } from './auth.js';
import { AppError, errorHandler } from '../middleware/errors.js';

function requireAdmin(auth) {
  const user = requireUser(auth);
  return [user, (req, _res, next) => next(req.user.role === 'admin'
    ? undefined
    : new AppError('ADMIN_REQUIRED', 'Administrator access is required.'))];
}

export function adminRouter({ auth, pool }) {
  const router = express.Router();
  const admin = requireAdmin(auth);

  router.get('/session', ...admin, (req, res) => res.json({ ok: true, user: req.user }));
  router.get('/users', ...admin, async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT u.id, u.status, u.role, u.created_at AS "createdAt", u.last_seen_at AS "lastSeenAt",
                p.display_name AS "displayName", p.village, p.language, r.name AS "regionName"
         FROM app.users u JOIN app.user_profiles p ON p.user_id=u.id JOIN app.regions r ON r.id=p.region_id
         ORDER BY u.created_at DESC LIMIT 200`,
      );
      res.json({ ok: true, users: result.rows });
    } catch (err) { next(err); }
  });
  router.patch('/users/:id', ...admin, async (req, res, next) => {
    try {
      const { status } = req.body || {};
      if (!['active', 'suspended'].includes(status)) {
        throw new AppError('INVALID_STATUS', 'Status must be active or suspended.', { status: 400, field: 'status' });
      }
      if (req.params.id === req.user.id && status !== 'active') {
        throw new AppError('SELF_SUSPEND', 'You cannot suspend your own account.', { status: 400 });
      }
      const result = await pool.query('UPDATE app.users SET status=$2, updated_at=now() WHERE id=$1 RETURNING id, status', [req.params.id, status]);
      if (!result.rowCount) throw new AppError('NOT_FOUND', 'User was not found.');
      await pool.query('INSERT INTO app.admin_audit_log (actor_id,action,target_user_id,detail) VALUES ($1,$2,$3,$4)', [req.user.id, 'user_status_changed', req.params.id, JSON.stringify({ status })]);
      res.json({ ok: true, user: result.rows[0] });
    } catch (err) { next(err); }
  });
  router.get('/catalog', ...admin, async (_req, res, next) => {
    try {
      const [regions, crops, settings] = await Promise.all([
        pool.query('SELECT id, code, country_code AS "countryCode", name FROM app.regions ORDER BY name'),
        pool.query('SELECT id, code, name, active FROM app.crops ORDER BY name'),
        pool.query('SELECT key, value, updated_at AS "updatedAt" FROM app.app_settings ORDER BY key'),
      ]);
      res.json({ ok: true, regions: regions.rows, crops: crops.rows, settings: settings.rows });
    } catch (err) { next(err); }
  });
  router.put('/settings/:key', ...admin, async (req, res, next) => {
    try {
      const { key } = req.params;
      let value;
      if (key === 'maintenance_mode') {
        if (typeof req.body?.value !== 'boolean') throw new AppError('VALIDATION_ERROR', 'Maintenance mode must be true or false.', { field: 'value' });
        value = req.body.value;
      } else if (key === 'welcome_message') {
        value = String(req.body?.value ?? '').trim().slice(0, 160);
      } else throw new AppError('NOT_FOUND', 'This setting cannot be changed.');
      await pool.query('UPDATE app.app_settings SET value=$2::jsonb, updated_by=$3, updated_at=now() WHERE key=$1', [key, JSON.stringify(value), req.user.id]);
      await pool.query('INSERT INTO app.admin_audit_log (actor_id,action,detail) VALUES ($1,$2,$3)', [req.user.id, 'setting_changed', JSON.stringify({ key, value })]);
      res.json({ ok: true, key, value });
    } catch (err) { next(err); }
  });
  router.use(errorHandler);
  return router;
}
