// Usage: DATABASE_URL=postgres://... npm run db:migrate
// The migration connection must use the dedicated migrator role, not the app role.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPool } from './pool.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

// The shared VM ledger holds both '001_foundation' and '004_identity_admin.sql', so
// versions are compared without the extension; new rows are recorded without it.
export const migrationVersion = (name) => name.replace(/\.sql$/, '');

export async function runMigrations(pool, dir = MIGRATIONS_DIR, log = console.log) {
  await pool.query('CREATE SCHEMA IF NOT EXISTS app');
  await pool.query('CREATE TABLE IF NOT EXISTS app.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await pool.query('SELECT version FROM app.schema_migrations')).rows.map((row) => migrationVersion(row.version)));
  const files = (await fs.readdir(dir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  const ran = [];
  for (const file of files) {
    const version = migrationVersion(file);
    if (applied.has(version)) continue;
    const client = await pool.connect();
    try {
      // Migration files use their own BEGIN/COMMIT so schema changes stay
      // atomic; record the version only after the file completes.
      await client.query(await fs.readFile(path.join(dir, file), 'utf8'));
      await client.query('INSERT INTO app.schema_migrations (version) VALUES ($1)', [version]);
      log(`applied ${file}`);
      ran.push(version);
    } finally { client.release(); }
  }
  return ran;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool();
  if (!pool) throw new Error('DATABASE_URL is required.');
  try { await runMigrations(pool); } finally { await pool.end(); }
}
