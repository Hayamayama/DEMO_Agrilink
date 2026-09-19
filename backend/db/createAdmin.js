// One-time bootstrap, no SQL required:
// DATABASE_URL=... AUTH_LOOKUP_SECRET=... npm run admin:create -- --phone 919876543210 --pin 123456 --name "Team Admin" --village Rampur --region IN-UP-01
import { createPool } from './pool.js';
import { createAuthService } from '../services/authService.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const pool = createPool();
if (!pool) throw new Error('DATABASE_URL is required.');
const required = ['phone', 'pin', 'name', 'village', 'region'];
for (const key of required) if (!args[key]) throw new Error(`Missing --${key}.`);
const auth = createAuthService(pool);
try {
  const region = await pool.query('SELECT id FROM app.regions WHERE code=$1', [args.region]);
  if (!region.rowCount) throw new Error(`No region with code ${args.region}. Seed regions first.`);
  const result = await auth.signup({ phone: args.phone, pin: args.pin, displayName: args.name, village: args.village, regionId: region.rows[0].id });
  await pool.query("UPDATE app.users SET role='admin', updated_at=now() WHERE id=$1", [result.user.id]);
  console.log(`Administrator created: ${result.user.displayName}. Open /admin and sign in.`);
} finally { await pool.end(); }
