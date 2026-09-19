// Local, disposable Today's Farm demo over PGlite. It exercises the production
// routers and migrations without requiring a developer PostgreSQL installation.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgPool } from '../tests/helpers.js';
import { createAuthService } from '../services/authService.js';
import { authRouter } from '../routes/auth.js';
import { createFarmOpsRouter } from '../routes/farmOps.js';
import { forumErrorHandler } from '../middleware/errors.js';
import { ensureForumReference } from '../db/forumReference.js';
import { seedDemo } from '../db/forumSeed.js';
import { seedFarmOps } from '../db/farmOpsSeed.js';
import { createForumRouter } from '../routes/forum.js';
import { createFarmPriceService } from '../services/priceService.js';
import { createMandiPriceProvider } from '../providers/mandiPriceProvider.js';
import { createPriceCacheRepository } from '../repositories/priceCacheRepository.js';
import { getWeather } from '../services/weatherService.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = (name) => fs.readFileSync(path.join(here, '..', 'db', 'migrations', name), 'utf8');
const db = new PGlite();
await db.exec('CREATE ROLE agrilink_app; CREATE ROLE agrilink_migrator;');
await db.exec(migration('001_foundation.sql').replace(/CREATE EXTENSION[^;]*;/, ''));
await db.exec(migration('004_identity_admin.sql'));
await db.exec(migration('005_forum.sql'));
await db.exec(migration('007_farm_operations.sql'));
await db.exec(migration('008_region_coordinates.sql'));
await db.exec(migration('011_farm_live_data.sql'));
const pool = pgPool(db);
const auth = createAuthService(pool, { AUTH_LOOKUP_SECRET: 'local-farm-ops-demo-secret-that-is-not-production', NODE_ENV: 'test' });
await ensureForumReference(pool);
await seedDemo(pool, { auth, pin: '246810' });
await seedFarmOps(pool, { demoDate: process.env.DEMO_DATE || '2026-09-19' });

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use('/api/auth', authRouter({ auth, pool }));
app.use('/api/forum', createForumRouter({ pool, auth }).router);
const farmPriceService=createFarmPriceService({provider:createMandiPriceProvider(),cache:createPriceCacheRepository(pool)});
app.use('/api/farms', createFarmOpsRouter({ pool, auth, farmPriceService, weatherGetter:getWeather }).router);
app.use(express.static(path.join(here, '..', '..', 'frontend')));
app.use(forumErrorHandler);
const port = Number(process.env.PORT) || 3100;
const server = app.listen(port, '127.0.0.1', () => console.log(`Farm Ops demo: http://127.0.0.1:${port}/?demoDate=2026-09-19`));
async function close() { server.closeAllConnections(); server.close(); await db.close(); }
process.on('SIGINT', close); process.on('SIGTERM', close);
