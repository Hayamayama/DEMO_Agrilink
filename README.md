# AgriLink Demo

This repository is the **demo-only** companion to AgriLink. It is deliberately
separate from the formal product repository: it may contain guided judge flows,
fictional seed data and presentation copy, but must not become the source for
production security, authentication, TTS or trading changes.

## Demo mode

With PostgreSQL migrated and fictional data seeded, set the following in
`backend/.env` (never commit that file):

```ini
DEMO_MODE=true
DEMO_USER_PHONE=9100000001
DEMO_USER_PIN=246810
SEED_DEMO_DATA=true
DEMO_DATE=2026-09-19
```

The browser then opens a guided entry screen. It offers three repeatable judge
paths: **Now** (farm actions), **Alerts** (weather + `#` read-aloud), and
**Trade** (terms + pickup code). `SEED_DEMO_DATA=true` refreshes the fictional
forum, farm and market records on startup. `GET /api/version` is the deployment receipt:
record its SHA with every physical-device test.

`Alerts` deliberately reads from `/api/demo/alerts`, a labelled fixed scenario,
not the live weather provider. This keeps the judge path usable when external
weather, price or AI services are slow or unavailable.

## Boundaries

- Product/security/provider bugs belong upstream first; then bring the fix here.
- Demo-only data, journeys and presentation stay here.
- Do not replace or alter the formal AgriLink service. The demo deployment is a
  second service (`agrilink-demo`, port 3001), database (`agrilink_demo`) and
  hostname (`demo-203-116-30-130.sslip.io`). Run `deploy/setup-demo-vm.sh` on
  the VM only after reviewing its separate-service boundary.
