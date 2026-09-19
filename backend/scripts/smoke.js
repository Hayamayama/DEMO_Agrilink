// Boots the real server.js without a database (the in-memory demo mode) and checks that it serves
// the frontend and answers the API in the error envelope. Used by CI; run locally with `npm run smoke`.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
// Empty values win over backend/.env (dotenv never overrides a variable that is already set),
// so a developer's local DATABASE_URL or Gemini key is never used here.
const server = spawn(process.execPath, ['server.js'], {
  cwd: backend,
  env: { ...process.env, PORT: String(port), DATABASE_URL: '', GEMINI_API_KEY: '', SEED_DEMO_DATA: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', (d) => { output += d; });
server.stderr.on('data', (d) => { output += d; });

async function waitUntilUp(deadline = Date.now() + 15_000) {
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error(`server exited with code ${server.exitCode}`);
    try { await fetch(base); return; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error('server did not start within 15 s');
}

async function get(p) {
  const res = await fetch(base + p);
  const type = res.headers.get('content-type') || '';
  return { status: res.status, id: res.headers.get('x-request-id'), body: type.includes('json') ? await res.json() : await res.text() };
}

const checks = [
  ['frontend is served', async () => {
    const r = await get('/');
    return r.status === 200 && String(r.body).includes('js/main.js');
  }],
  ['Ask AI reports its capabilities', async () => {
    const r = await get('/api/ai/capabilities');
    return r.status === 200 && r.body.ok === true;
  }],
  ['prices work from the in-memory seed', async () => {
    const r = await get('/api/prices/crops?region=IN-UP-01');
    return r.status === 200 && r.body.ok === true && r.body.items.length > 0;
  }],
  ['bad input returns the error envelope', async () => {
    const r = await get('/api/prices?crop=rice');
    return r.status === 400 && r.body.ok === false && r.body.error.code === 'VALIDATION_ERROR' && r.body.error.requestId === r.id;
  }],
  ['unknown API paths are JSON 404s', async () => {
    const r = await get('/api/does-not-exist');
    return r.status === 404 && r.body.error?.code === 'NOT_FOUND';
  }],
  ['features without a database answer 503, not a crash', async () => {
    const r = await get('/api/forum/posts');
    return r.status === 503 && r.body.error?.retryable === true;
  }],
  ['every response carries X-Request-Id', async () => /^[0-9a-f-]{36}$/.test((await get('/')).id || '')],
];

let failed = 0;
try {
  await waitUntilUp();
  for (const [name, check] of checks) {
    let ok = false;
    try { ok = await check(); } catch (err) { console.error(`  ${err.message}`); }
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
    if (!ok) failed += 1;
  }
} catch (err) {
  console.error(`FAIL ${err.message}`);
  failed += 1;
} finally {
  server.kill();
}
if (failed) {
  console.error(`\n${failed} smoke check(s) failed. Server output:\n${output}`);
  process.exit(1);
}
console.log('\nsmoke: all checks passed');
