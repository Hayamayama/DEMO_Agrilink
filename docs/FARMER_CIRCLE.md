# Farmer Circle — run, seed, demo

Reddit-style agricultural forum. Anyone can read; a signed-in member can post, reply, vote, save, report and mark a solution. **No AI features.** Spec: `FARMER_CIRCLE_MASTER_PROMPT.md`.

It runs on the app's existing PostgreSQL (`app` schema) and identity system (phone + PIN, see `AUTH_ADMIN_RUNBOOK.md`): authors are `app.users`, locations are `app.regions`. The forum adds `app.forum_*` tables in migration `backend/db/migrations/005_forum.sql`.

## Deploy / run against Postgres

```bash
cd backend
DATABASE_URL=<migrator url> npm run db:migrate    # applies 005_forum.sql (or: psql -f as postgres)
# backend/.env: DATABASE_URL, AUTH_LOOKUP_SECRET, and optionally SEED_DEMO_DATA=true + DEMO_USER_PIN=<6 digits>
npm start
```

Communities and tags are upserted on every start. Demo content is created on start when `SEED_DEMO_DATA=true`, or by hand with `npm run forum:seed`. Seeding is idempotent: fixed ids, and each run only refreshes the demo timestamps so posts look recent. It never touches real users' content. If migration 005 has not been applied the server still starts and `/api/forum` answers 503.

## Try it without installing Postgres

```bash
cd backend && npm install && npm run forum:dev      # http://localhost:3100, in-process Postgres (PGlite), in-memory
npm test                                            # the same PGlite database runs the API tests
```

## Demo accounts

| Phone | Name | Role |
|---|---|---|
| 9100000001 | Ravi K. | member (author of "Brown spots") |
| 9100000002 | Asha P. | member |
| 9100000003 | Minh Tran | member |
| 9100000004 | Rahim U. | member |
| 9100000005 | Meena S. | **moderator** |

PIN: `DEMO_USER_PIN` from the environment. Outside production it falls back to the documented demo value `246810`; with `NODE_ENV=production` seeding **refuses to run** unless `DEMO_USER_PIN` is set, so there is never a public default-password account. Demo members are created through the normal `auth.signup`. The 34 "voter" rows exist only to make vote counts real: status `deleted`, no credentials, they can never sign in. The seed also adds regions `IN-BR` (Bihar), `VN-AG` (An Giang) and `BD-RAJ` (Rajshahi) if missing; they will show up in the sign-up region list.

## Keys (feed)

Left/Right sort Local→New→Top · Up/Down move · Enter open · `1`–`5` community · `0` all communities · `#` options/filters · `*` saved posts · left softkey New post.
Post detail: `1` up · `0` down · `2` reply · `3` save · `#` actions (report, mark solution, moderator) · `*` jump post↔replies.
Text entry: multi-tap, `*` delete, `#` commit letter, `# #` or Enter = done, Right = new paragraph.

## Design notes and differences from the master prompt

- **Identity is the app's** (phone + PIN, scrypt, `app.auth_sessions`), not a separate Farm ID. The app still requires sign-in at launch, so guests only appear when a session expires; the server-side guest rules (public reads, 401 on writes) are tested.
- **Moderators:** migration 005 widens `app.users.role` to `member | moderator | admin`; admins are also moderators.
- Scores are `SUM(app.forum_votes.value)`; the client can never set one. `accepted_reply_id` has no FK (posts↔replies is circular); the service checks it in a transaction.
- Default feed scope is **Everywhere**; Local sort ranks the viewer's region, then country, first. Guests pick a browse region in Options.
- `CommunityFeed` is the home feed with a community filter (`1`–`5`); `CommunityList` and every wizard choice step are one generic numbered picker (`screens/forumPicker.js`).
- Feed cursor is opaque but encodes an offset (fine at this scale).
- Rate limits are in memory and reset on restart.
- Photo upload (P1) is **not** implemented. Reply-to-reply works in the API and renders indented, with no keypad entry point yet.

## Still needs a physical-device pass

Real Cloud Phone key codes (softkeys, `#`, `*`), the platform's right-softkey history behaviour on the wizard screens, and reading speed at 128×160. Verified in a browser at 240×320 and 128×160 only.
