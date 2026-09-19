import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgPool } from './helpers.js';
import { runMigrations } from '../db/migrate.js';

// Mirrors the VM ledger: 001-003 recorded without '.sql', 004 with it. Re-running any of
// them would fail because each CREATE TABLE already exists.
test('runMigrations skips ledger rows with or without the .sql extension', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'migrations-'));
  const names = ['001_foundation', '002_marketplace', '003_market_prices', '004_identity_admin', '005_forum'];
  for (const [i, name] of names.entries()) await fs.writeFile(path.join(dir, `${name}.sql`), `CREATE TABLE app.t${i + 1} (id int)`);
  const db = new PGlite();
  const pool = pgPool(db);
  await db.exec(`CREATE SCHEMA app;
    CREATE TABLE app.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE app.t1 (id int); CREATE TABLE app.t2 (id int); CREATE TABLE app.t3 (id int); CREATE TABLE app.t4 (id int);
    INSERT INTO app.schema_migrations (version) VALUES ('001_foundation'), ('002_marketplace'), ('003_market_prices'), ('004_identity_admin.sql');`);

  assert.deepEqual(await runMigrations(pool, dir, () => {}), ['005_forum']);
  assert.deepEqual(await runMigrations(pool, dir, () => {}), []);
  const rows = (await db.query("SELECT version FROM app.schema_migrations WHERE version LIKE '005%'")).rows;
  assert.deepEqual(rows, [{ version: '005_forum' }]);
  await db.close();
  await fs.rm(dir, { recursive: true });
});
