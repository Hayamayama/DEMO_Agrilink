import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import weather from './routes/weather.js';
import { pricesRouter } from './routes/prices.js';
import { createPool } from './db/pool.js';
import { memoryRepo, pgRepo } from './services/priceRepo.js';
import { createPriceService } from './services/priceService.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

// Postgres when DATABASE_URL is set, otherwise the in-memory demo data (flagged sample).
const pool = createPool();
console.log(pool ? 'prices: using Postgres' : 'prices: using in-memory seed data');
const prices = createPriceService(pool ? pgRepo(pool) : memoryRepo());
app.use('/api/prices', pricesRouter(prices));
app.use('/api/weather', weather);
app.use(express.static(path.join(here, '..', 'frontend')));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`AgriLink listening on :${port}`));
