import pg from 'pg';

// Returns null when DATABASE_URL is unset so the app still runs on the in-memory seed data.
export function createPool(url = process.env.DATABASE_URL) {
  if (!url) return null;
  return new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 3000 });
}
