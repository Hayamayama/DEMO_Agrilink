BEGIN;

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
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES app.listings(id),
  buyer_id   uuid NOT NULL REFERENCES app.users(id),
  status     text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  UNIQUE (listing_id, buyer_id)
);
CREATE INDEX listing_interests_buyer_idx ON app.listing_interests(buyer_id, created_at DESC);

CREATE TABLE app.listing_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES app.listings(id),
  actor_id   uuid REFERENCES app.users(id),
  event_type text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type IN ('created', 'interest_created', 'interest_accepted',
                        'interest_declined', 'boosted', 'closed', 'expired'))
);
CREATE INDEX listing_events_listing_idx ON app.listing_events(listing_id, created_at DESC);

CREATE TABLE app.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  payload    jsonb NOT NULL,
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (type IN ('listing_interest', 'listing_status', 'forum_reply',
                  'price_alert', 'task', 'system'))
);
CREATE UNIQUE INDEX notifications_dedupe_idx
  ON app.notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX notifications_inbox_idx ON app.notifications(user_id, read_at, created_at DESC);

CREATE TABLE app.outbox_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic        text NOT NULL,
  recipient_id uuid REFERENCES app.users(id) ON DELETE CASCADE,
  region_id    uuid REFERENCES app.regions(id),
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  CHECK (recipient_id IS NOT NULL OR region_id IS NOT NULL)
);
CREATE INDEX outbox_pending_idx ON app.outbox_events(id) WHERE delivered_at IS NULL;

COMMIT;
