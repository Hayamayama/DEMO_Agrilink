# Identity and admin runbook

## Keypad-first account design

AgriLink uses a **phone number plus a six-digit PIN**, rather than email and a
long password. It is the smallest familiar flow that works on a 12-key phone:

1. Enter the 8–15 digit mobile number once.
2. Pick and confirm a six-digit PIN (always masked on screen).
3. Enter a display name and village using multi-tap, then select a region from
   a list. Crops and language can be completed later in Settings.

The browser receives only a Secure/HttpOnly session cookie. Phone numbers are
normalised then stored as a keyed HMAC lookup value; PINs use Node's scrypt and
are never recoverable. Five wrong PINs lock that account for 15 minutes.

For a public launch, registration must be preceded by an SMS one-time-code
provider. This repo intentionally does not pretend an unverified phone number
proves ownership: the current flow is suitable for the hackathon/private pilot,
where a field worker can also recover an account through an administrator.
Adding an SMS provider should keep the same phone+PIN UI and complete the OTP
check before `POST /api/auth/signup`.

## Provisioning

Set a different, randomly generated production secret in `backend/.env`:

```dotenv
DATABASE_URL=postgres://agrilink_app:...@127.0.0.1/agrilink
AUTH_LOOKUP_SECRET=at-least-32-random-characters-kept-out-of-git
NODE_ENV=production
```

Apply migrations using the **migrator** database role (not the application
role), then seed the catalogue before creating the initial operator:

```sh
cd backend
DATABASE_URL=... npm run db:migrate
DATABASE_URL=... npm run seed
DATABASE_URL=... AUTH_LOOKUP_SECRET=... npm run admin:create -- \
  --phone 919876543210 --pin 482917 --name "Team Admin" \
  --village Rampur --region IN-UP-01
```

`admin:create` is intentionally a one-time bootstrap command. After that,
operators use `https://<host>/admin`: no direct SQL is needed to view members,
suspend/restore accounts, or update the welcome and maintenance settings. All
admin changes are recorded in `app.admin_audit_log`.

## API surface

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/signup` | Register a keypad account and create a session |
| `POST /api/auth/login` | Sign in with phone number and PIN |
| `GET /api/auth/session` | Restore the current signed-in profile |
| `PATCH /api/auth/profile` | Update profile, language, region and crops |
| `POST /api/auth/logout` | Revoke the current session |
| `/api/admin/*` | Administrator-only member, catalogue and setting controls |

The auth endpoints only start when both PostgreSQL and
`AUTH_LOOKUP_SECRET` are configured; there is no insecure memory-mode login.
