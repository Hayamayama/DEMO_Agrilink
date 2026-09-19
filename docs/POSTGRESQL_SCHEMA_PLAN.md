# AgriLink PostgreSQL Schema Plan

## Decision

AgriLink will use one self-hosted PostgreSQL instance as the authoritative store for identity, marketplace, community, information snapshots, points, notifications and realtime replay. The browser only calls the Node API/WebSocket server; it never receives a database credential.

Use PostgreSQL 16+ with `pgcrypto` for UUID generation. All application tables live in the `app` schema. Times are stored as `timestamptz` in UTC, and money/quantities use `numeric`, never `real`.

## Delivery sequence

1. Provision PostgreSQL on the Ubuntu VM on a private Docker network.
2. Create separate migration and application roles; the application role is not a superuser.
3. Apply the foundation and marketplace migrations below, then seed two demo users, Rampur and a small crop/market catalogue.
4. Implement API transactions before enabling WebSocket broadcasts.
5. Add forum, points and information modules as their screens are implemented.

The first demonstration milestone is: user A creates a listing; user B sees it; user B registers interest; user A receives one notification. The listing, interest, notification and outbox event must be committed in one transaction.

## Rules that apply to every migration

- Migration files are append-only and ordered: `001_foundation.sql`, `002_marketplace.sql`, etc.
- API writes use parameterized queries only.
- Foreign-key columns receive explicit indexes where queried or joined.
- `created_at` is immutable. Each mutable root entity also has `updated_at`.
- Do not delete business records in normal flows. Use statuses or `deleted_at` where necessary.
- Mobile retries must carry an idempotency key for operations that create money, points, interest or listings.
- IMEI/device identifiers are never stored raw. If device recognition is required, store a server-keyed HMAC digest in `auth_identities.subject_hash`.

## Foundation migration (`001_foundation.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE app.regions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  country_code char(2) NOT NULL,
  name         text NOT NULL,
  latitude     numeric(8,5),
  longitude    numeric(8,5),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude BETWEEN -90 AND 90),
  CHECK (longitude BETWEEN -180 AND 180)
);

CREATE TABLE app.users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  CHECK (status IN ('active', 'suspended', 'deleted'))
);

CREATE TABLE app.auth_identities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  provider     text NOT NULL,
  subject_hash text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject_hash)
);
CREATE INDEX auth_identities_user_idx ON app.auth_identities(user_id);

CREATE TABLE app.user_profiles (
  user_id      uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  village      text NOT NULL,
  region_id    uuid NOT NULL REFERENCES app.regions(id),
  language     text NOT NULL DEFAULT 'en',
  latitude     numeric(8,5),
  longitude    numeric(8,5),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(display_name) BETWEEN 1 AND 60),
  CHECK (language IN ('en', 'hi', 'bn', 'vi')),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX user_profiles_region_idx ON app.user_profiles(region_id);

CREATE TABLE app.crops (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  name         text NOT NULL,
  active       boolean NOT NULL DEFAULT true
);

CREATE TABLE app.user_crops (
  user_id      uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  crop_id      uuid NOT NULL REFERENCES app.crops(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, crop_id)
);
CREATE INDEX user_crops_crop_idx ON app.user_crops(crop_id);
```

## Marketplace and notifications (`002_marketplace.sql`)

```sql
CREATE TABLE app.listings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id      uuid NOT NULL REFERENCES app.users(id),
  crop_id        uuid NOT NULL REFERENCES app.crops(id),
  region_id      uuid NOT NULL REFERENCES app.regions(id),
  village        text NOT NULL,
  side           text NOT NULL DEFAULT 'sell',
  quantity       numeric(12,3) NOT NULL,
  quantity_unit  text NOT NULL,
  price_amount   numeric(14,2) NOT NULL,
  currency_code  char(3) NOT NULL,
  price_unit     text NOT NULL,
  status         text NOT NULL DEFAULT 'active',
  boosted_until  timestamptz,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (side IN ('sell', 'buy')),
  CHECK (quantity > 0),
  CHECK (price_amount >= 0),
  CHECK (char_length(quantity_unit) BETWEEN 1 AND 16),
  CHECK (char_length(price_unit) BETWEEN 1 AND 24),
  CHECK (status IN ('draft', 'active', 'reserved', 'matched', 'closed', 'expired')),
  CHECK (expires_at > created_at)
);
CREATE INDEX listings_feed_idx
  ON app.listings (region_id, status, boosted_until DESC NULLS LAST, created_at DESC)
  WHERE status = 'active';
CREATE INDEX listings_seller_idx ON app.listings(seller_id, created_at DESC);

CREATE TABLE app.listing_interests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   uuid NOT NULL REFERENCES app.listings(id),
  buyer_id     uuid NOT NULL REFERENCES app.users(id),
  status       text NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  UNIQUE (listing_id, buyer_id)
);
CREATE INDEX listing_interests_buyer_idx ON app.listing_interests(buyer_id, created_at DESC);

CREATE TABLE app.listing_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id   uuid NOT NULL REFERENCES app.listings(id),
  actor_id     uuid REFERENCES app.users(id),
  event_type   text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type IN ('created', 'interest_created', 'interest_accepted',
                        'interest_declined', 'boosted', 'closed', 'expired'))
);
CREATE INDEX listing_events_listing_idx ON app.listing_events(listing_id, created_at DESC);

CREATE TABLE app.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  type          text NOT NULL,
  payload       jsonb NOT NULL,
  dedupe_key    text,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (type IN ('listing_interest', 'listing_status', 'forum_reply',
                  'price_alert', 'task', 'system'))
);
CREATE UNIQUE INDEX notifications_dedupe_idx
  ON app.notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX notifications_inbox_idx ON app.notifications(user_id, read_at, created_at DESC);

CREATE TABLE app.outbox_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic         text NOT NULL,
  recipient_id  uuid REFERENCES app.users(id) ON DELETE CASCADE,
  region_id     uuid REFERENCES app.regions(id),
  payload       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz,
  CHECK (recipient_id IS NOT NULL OR region_id IS NOT NULL)
);
CREATE INDEX outbox_pending_idx ON app.outbox_events(id) WHERE delivered_at IS NULL;
```

> PostgreSQL `CHECK` constraints only safely validate the row being written. The Node transaction validates that a seller cannot be their own buyer; the unique key makes repeat interest submissions safe.

## Community (`003_forum.sql`)

```sql
CREATE TABLE app.forum_posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    uuid NOT NULL REFERENCES app.users(id),
  region_id    uuid NOT NULL REFERENCES app.regions(id),
  category     text NOT NULL,
  title        text NOT NULL,
  body         text NOT NULL,
  status       text NOT NULL DEFAULT 'published',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (category IN ('pest', 'tips', 'market', 'weather')),
  CHECK (char_length(title) BETWEEN 1 AND 80),
  CHECK (char_length(body) BETWEEN 1 AND 160),
  CHECK (status IN ('published', 'hidden', 'deleted'))
);
CREATE INDEX forum_posts_feed_idx ON app.forum_posts(region_id, category, created_at DESC)
  WHERE status = 'published';

CREATE TABLE app.forum_replies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid NOT NULL REFERENCES app.forum_posts(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL REFERENCES app.users(id),
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(body) BETWEEN 1 AND 160)
);
CREATE INDEX forum_replies_post_idx ON app.forum_replies(post_id, created_at);

CREATE TABLE app.post_reactions (
  post_id      uuid NOT NULL REFERENCES app.forum_posts(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  reaction     text NOT NULL DEFAULT 'like',
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, reaction),
  CHECK (reaction = 'like')
);

CREATE TABLE app.post_subscriptions (
  post_id      uuid NOT NULL REFERENCES app.forum_posts(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
```

## Information, tasks and points (`004_information_and_rewards.sql`)

```sql
CREATE TABLE app.markets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id    uuid NOT NULL REFERENCES app.regions(id),
  external_ref text,
  name         text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  UNIQUE (region_id, name)
);

CREATE TABLE app.market_price_observations (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_id     uuid NOT NULL REFERENCES app.markets(id),
  crop_id       uuid NOT NULL REFERENCES app.crops(id),
  price_amount  numeric(14,2) NOT NULL CHECK (price_amount >= 0),
  currency_code char(3) NOT NULL,
  unit          text NOT NULL,
  source        text NOT NULL,
  source_ref    text,
  is_sample     boolean NOT NULL DEFAULT false,
  observed_at   timestamptz NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_ref)
);
CREATE INDEX price_latest_idx
  ON app.market_price_observations(market_id, crop_id, observed_at DESC);

CREATE TABLE app.price_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  crop_id       uuid NOT NULL REFERENCES app.crops(id),
  region_id     uuid NOT NULL REFERENCES app.regions(id),
  direction     text NOT NULL,
  target_amount numeric(14,2) NOT NULL CHECK (target_amount >= 0),
  currency_code char(3) NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  triggered_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (direction IN ('above', 'below'))
);
CREATE INDEX price_alerts_active_idx ON app.price_alerts(crop_id, region_id)
  WHERE active;

CREATE TABLE app.task_definitions (
  id            text PRIMARY KEY,
  label_key     text NOT NULL,
  points_award  integer NOT NULL CHECK (points_award > 0),
  verification  text NOT NULL,
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE app.task_completions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  task_id       text NOT NULL REFERENCES app.task_definitions(id),
  completed_on  date NOT NULL,
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_id, completed_on)
);

CREATE TABLE app.points_ledger (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  delta           integer NOT NULL CHECK (delta <> 0),
  reason          text NOT NULL,
  idempotency_key text,
  reference_type  text,
  reference_id    uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (reason IN ('task', 'streak_bonus', 'listing_boost', 'ai_report', 'admin_adjustment'))
);
CREATE UNIQUE INDEX points_ledger_idempotency_idx
  ON app.points_ledger(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX points_ledger_user_idx ON app.points_ledger(user_id, created_at DESC);

CREATE TABLE app.reward_redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app.users(id),
  reward_type   text NOT NULL,
  points_cost   integer NOT NULL CHECK (points_cost > 0),
  status        text NOT NULL DEFAULT 'completed',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (reward_type IN ('listing_boost', 'ai_report')),
  CHECK (status IN ('completed', 'reversed'))
);
```

## Required API transactions

### Create interest

1. Verify the listing exists, is active and is not owned by the requester.
2. Insert `listing_interests`; its unique key makes retries safe.
3. Append `listing_events`.
4. Insert one deduplicated seller `notifications` row.
5. Insert a seller-scoped `outbox_events` row.
6. Commit; only then broadcast the outbox event.

### Redeem points / boost a listing

1. Start a transaction and lock the user's ledger/balance row or use one atomic balance update.
2. Confirm available points cover the cost.
3. Write the negative `points_ledger` entry and `reward_redemptions` record.
4. Update `listings.boosted_until`, append a listing event and outbox event.
5. Commit. Any failure rolls back all five writes.

Do not hold a database transaction open while waiting for a user, external API or LLM response.

## Deliberately deferred

- `weather_snapshots`: retain only if cross-restart weather fallback becomes a requirement; the current 30-minute in-memory cache is enough for P0.
- Full-text search, PostGIS, audit/version history and attachment storage: not needed for the hackathon core flow.
- Row-Level Security: unnecessary while Node is the only database client; add only if clients later connect directly to PostgREST/Supabase-like APIs.
- Password tables: for the hackathon, use a server-issued demo session tied to a hashed device identifier or explicit demo account. If real passwords are introduced, use Argon2id hashes and hashed refresh tokens; never add plaintext password columns.

## Acceptance checks

- A duplicate interest request creates one interest and one notification only.
- A failed notification/outbox insert rolls back its corresponding interest or listing update.
- A user cannot create an active listing with zero quantity, negative price or invalid status.
- Two simultaneous boost requests cannot spend more points than are available.
- `GET /sync?since=<outbox id>` can replay every committed event after a disconnected client reconnects.
