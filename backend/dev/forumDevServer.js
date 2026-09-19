// Farmer Circle on an in-process PostgreSQL (PGlite) - for trying the UI without installing Postgres.
//   npm run forum:dev        -> http://localhost:3100   (data is in memory; restarts start fresh)
// Local Market is mounted too (/api/market) with a few crops.
// Sign in with a demo phone (9100000001 ... 9100000005) and PIN 246810.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDb } from '../tests/helpers.js';
import { createAuthService } from '../services/authService.js';
import { authRouter } from '../routes/auth.js';
import { createForumRouter } from '../routes/forum.js';
import { forumErrorHandler } from '../middleware/errors.js';
import { ensureForumReference } from '../db/forumReference.js';
import { seedDemo } from '../db/forumSeed.js';
import { createMarketRouter } from '../routes/market.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const { db, pool } = await makeDb();
for (const m of ['002_marketplace.sql', '006_market_exchange.sql']) await db.exec(fs.readFileSync(path.join(here, '..', 'db', 'migrations', m), 'utf8'));
await db.exec("INSERT INTO app.crops (code, name) VALUES ('rice','Rice'), ('wheat','Wheat'), ('tomato','Tomato'), ('onion','Onion'), ('maize','Maize')");
await ensureForumReference(pool);
const auth = createAuthService(pool, { AUTH_LOOKUP_SECRET: 'dev-only-secret-dev-only-secret-dev', NODE_ENV: 'development' });
await seedDemo(pool, { auth, pin: '246810' });

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use('/api/auth', authRouter({ auth, pool }));
app.use('/api/forum', createForumRouter({ pool, auth }).router);
app.use('/api/market', createMarketRouter({ pool, auth, env: { AUTH_LOOKUP_SECRET: 'dev-only-secret-dev-only-secret-dev' } }).router);
app.use(forumErrorHandler);
app.use(express.static(path.join(here, '..', '..', 'frontend')));
const port = Number(process.env.PORT) || 3100;
app.listen(port, () => console.log(`Farmer Circle dev server on http://localhost:${port}`));
