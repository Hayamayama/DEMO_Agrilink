// Usage: DATABASE_URL=postgres://... npm run db:migrate
// The migration connection must use the dedicated migrator role, not the app role.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './pool.js';

const pool = createPool();
if (!pool) throw new Error('DATABASE_URL is required.');
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
try {
  await pool.query('CREATE SCHEMA IF NOT EXISTS app');
  await pool.query('CREATE TABLE IF NOT EXISTS app.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await pool.query('SELECT version FROM app.schema_migrations')).rows.map((row) => row.version));
  const files = (await fs.readdir(dir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const client = await pool.connect();
    try {
      // Migration files use their own BEGIN/COMMIT so schema changes stay
      // atomic; record the version only after the file completes.
      await client.query(await fs.readFile(path.join(dir, file), 'utf8'));
      await client.query('INSERT INTO app.schema_migrations (version) VALUES ($1)', [file]);
      console.log(`applied ${file}`);
    } finally { client.release(); }
  }
} finally { await pool.end(); }
