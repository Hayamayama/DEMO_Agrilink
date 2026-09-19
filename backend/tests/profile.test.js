import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { startForum } from './helpers.js';

// Ask AI and Weather personalise from these profile fields.
test('the profile carries region code, coordinates and crop codes', async () => {
  const t = await startForum();
  try {
    const { user } = await t.auth.login({ phone: '9100000001', pin: '246810' }); // Ravi, Bihar
    assert.equal(user.regionCode, 'IN-BR');
    assert.equal(user.regionLat, 25.5941);
    assert.equal(user.regionLng, 85.1376);
    assert.deepEqual(user.cropCodes, []);
    await t.pool.query("INSERT INTO app.crops (code, name) VALUES ('wheat','Wheat'), ('rice','Rice') ON CONFLICT DO NOTHING");
    await t.pool.query("INSERT INTO app.user_crops (user_id, crop_id) SELECT $1, id FROM app.crops WHERE code IN ('wheat','rice')", [user.id]);
    assert.deepEqual((await t.auth.profileFor(t.pool, user.id)).cropCodes, ['rice', 'wheat']);
  } finally { await t.close(); }
});

test('migration 008 fills missing region coordinates and leaves existing ones', async () => {
  const db = new PGlite();
  await db.exec(`CREATE SCHEMA app; CREATE TABLE app.regions (code text UNIQUE, latitude numeric(8,5), longitude numeric(8,5));
    INSERT INTO app.regions VALUES ('BD-RAJ', NULL, NULL), ('IN-UP-01', 1, 2), ('XX-OTHER', NULL, NULL);`);
  await db.exec(fs.readFileSync(new URL('../db/migrations/008_region_coordinates.sql', import.meta.url), 'utf8'));
  const rows = Object.fromEntries((await db.query('SELECT code, latitude::float8 lat, longitude::float8 lon FROM app.regions')).rows.map((r) => [r.code, [r.lat, r.lon]]));
  assert.deepEqual(rows, { 'BD-RAJ': [24.3745, 88.6042], 'IN-UP-01': [1, 2], 'XX-OTHER': [null, null] });
  await db.close();
});
