import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startForum } from './helpers.js';
import { seedFarmOps, FARM_DEMO_ID } from '../db/farmOpsSeed.js';
import { createFarmOpsService } from '../services/farmOpsService.js';
import { occurrenceDates } from '../services/recurrenceService.js';

const migration = fs.readFileSync(new URL('../db/migrations/007_farm_operations.sql', import.meta.url), 'utf8');

async function setup() {
  const t = await startForum();
  await t.db.exec(migration);
  await seedFarmOps(t.pool, { demoDate: '2026-09-19' });
  const users = (await t.pool.query(`SELECT s.demo_key,p.user_id id FROM app.forum_user_state s JOIN app.user_profiles p ON p.user_id=s.user_id WHERE s.demo_key IN ('10000001','10000002','10000003','10000004','10000005') ORDER BY s.demo_key`)).rows;
  const byKey = new Map(users.map((u) => [u.demo_key, u]));
  return { ...t, owner: byKey.get('10000001'), manager: byKey.get('10000005'), worker: byKey.get('10000002'), viewer: byKey.get('10000004'), ops: createFarmOpsService(t.pool) };
}

test('Today groups overdue, active, blocked and completed work with a real summary', async () => {
  const t = await setup();
  try {
    const out = await t.ops.overview(t.owner, FARM_DEMO_ID, '2026-09-19');
    assert.equal(out.summary.total, 5);
    assert.equal(out.summary.completed, 1);
    assert.equal(out.sections.overdue[0].title, 'Inspect pump');
    assert.equal(out.sections.blocked[0].title, 'Spray vegetable plot');
    assert.equal(out.sections.inProgress[0].title, 'Irrigate north section');
  } finally { await t.close(); }
});

test('demo seed is complete and idempotent', async () => {
  const t = await setup();
  try {
    const second = await seedFarmOps(t.pool, { demoDate: '2026-09-19' });
    assert.deepEqual({ members: second.members, fields: second.fields, cropCycles: second.cropCycles, tasks: second.tasks, records: second.records },
      { members: 5, fields: 3, cropCycles: 3, tasks: 13, records: 6 });
    const counts = (await t.pool.query(`SELECT
      (SELECT count(*)::int FROM app.farm_members WHERE farm_id=$1 AND status='active') members,
      (SELECT count(*)::int FROM app.farm_fields WHERE farm_id=$1) fields,
      (SELECT count(*)::int FROM app.crop_cycles WHERE farm_id=$1) cycles,
      (SELECT count(*)::int FROM app.farm_tasks WHERE farm_id=$1) tasks,
      (SELECT count(*)::int FROM app.farm_records WHERE farm_id=$1) records,
      (SELECT count(*)::int FROM app.farm_task_templates WHERE farm_id=$1) templates,
      (SELECT count(*)::int FROM app.farm_notifications WHERE farm_id=$1) notifications,
      (SELECT count(*)::int FROM app.farm_weather_snapshots WHERE farm_id=$1) weather`, [FARM_DEMO_ID])).rows[0];
    assert.deepEqual(counts, { members: 5, fields: 3, cycles: 3, tasks: 13, records: 6, templates: 3, notifications: 3, weather: 1 });
    const waiting = (await t.pool.query(`SELECT verification_required,status FROM app.farm_tasks WHERE title='Drainage repair review'`)).rows[0];
    assert.equal(waiting.verification_required, true);
    assert.equal(waiting.status, 'completed');
  } finally { await t.close(); }
});

test('task creation is idempotent and manager-only', async () => {
  const t = await setup();
  try {
    const body = { requestId: 'farm-create-abcdef', title: 'Inspect west gate', type: 'inspection', priority: 'normal', localDate: '2026-09-20' };
    const a = await t.ops.createTask(t.manager, FARM_DEMO_ID, body);
    const b = await t.ops.createTask(t.manager, FARM_DEMO_ID, body);
    assert.equal(a.id, b.id); assert.equal(b.duplicate, true);
    await assert.rejects(() => t.ops.createTask(t.viewer, FARM_DEMO_ID, { ...body, requestId: 'farm-create-other' }), (e) => e.code === 'ROLE_REQUIRED');
  } finally { await t.close(); }
});

test('worker lifecycle is server-authoritative and completion creates a farm record', async () => {
  const t = await setup();
  try {
    const task = (await t.pool.query(`SELECT id FROM app.farm_tasks WHERE title='Check tomato supports'`)).rows[0];
    await t.ops.transition(t.worker, task.id, 'accepted');
    await t.ops.transition(t.worker, task.id, 'in_progress');
    await t.ops.transition(t.worker, task.id, 'completed', { resultCode: 'normal', result: { pump: 'ok' } });
    const row = (await t.pool.query('SELECT status FROM app.farm_tasks WHERE id=$1', [task.id])).rows[0];
    const record = (await t.pool.query('SELECT data FROM app.farm_records WHERE task_id=$1', [task.id])).rows[0];
    assert.equal(row.status, 'completed'); assert.equal(record.data.result.pump, 'ok');
  } finally { await t.close(); }
});

test('recurrence expansion supports interval days, weekdays and month-end clamping', () => {
  assert.deepEqual(occurrenceDates('2026-09-19', { frequency: 'daily', interval: 3 }, { horizonDays: 10 }), ['2026-09-19','2026-09-22','2026-09-25','2026-09-28']);
  assert.deepEqual(occurrenceDates('2026-09-21', { frequency: 'weekly', weekdays: [1,4] }, { horizonDays: 10 }), ['2026-09-21','2026-09-24','2026-09-28','2026-10-01']);
  assert.deepEqual(occurrenceDates('2026-01-31', { frequency: 'monthly', day: 31 }, { horizonDays: 65 }), ['2026-01-31','2026-02-28','2026-03-31']);
});

test('a wrong PIN increments failures and returns INVALID_LOGIN instead of a PostgreSQL type error', async () => {
  const t = await setup();
  try {
    await assert.rejects(() => t.auth.login({ phone: '9100000001', pin: '000000' }), (e) => e.code === 'INVALID_LOGIN');
    const row = (await t.pool.query(`SELECT c.failed_attempts FROM app.auth_credentials c JOIN app.forum_user_state s ON s.user_id=c.user_id WHERE s.demo_key='10000001'`)).rows[0];
    assert.equal(Number(row.failed_attempts), 1);
  } finally { await t.close(); }
});
