import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import weather from './routes/weather.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use('/api/weather', weather);
app.use(express.static(path.join(here, '..', 'frontend')));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`AgriLink listening on :${port}`));
