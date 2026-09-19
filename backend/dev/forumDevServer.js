// Farmer Circle on an in-process PostgreSQL (PGlite) - for trying the UI without installing Postgres.
//   npm run forum:dev        -> http://localhost:3100   (data is in memory; restarts start fresh)
// Sign in with a demo phone (9100000001 ... 9100000005) and PIN 246810.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDb } from '../tests/helpers.js';
import { createAuthService } from '../services/authService.js';
import { authRouter } from '../routes/auth.js';
import { createForumRouter } from '../routes/forum.js';
import { forumErrorHandler } from '../middleware/errors.js';
import { ensureForumReference } from '../db/forumReference.js';
import { seedDemo } from '../db/forumSeed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const { pool } = await makeDb();
await ensureForumReference(pool);
const auth = createAuthService(pool, { AUTH_LOOKUP_SECRET: 'dev-only-secret-dev-only-secret-dev', NODE_ENV: 'development' });
await seedDemo(pool, { auth, pin: '246810' });

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use('/api/auth', authRouter({ auth, pool }));
app.use('/api/forum', createForumRouter({ pool, auth }).router);
app.use(forumErrorHandler);
app.use(express.static(path.join(here, '..', '..', 'frontend')));
const port = Number(process.env.PORT) || 3100;
app.listen(port, () => console.log(`Farmer Circle dev server on http://localhost:${port}`));
