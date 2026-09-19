-- Local Market (docs/buysell_exchange.md): listings, buyer requests, structured offers with
-- immutable revisions, bilateral deals and an append-only audit trail.
--
-- Schema decisions worth knowing:
--  * Everything lives in `app` and reuses app.users / app.regions / app.crops. The PRD's
--    `district_code` is app.regions (a region row is a district); it is never derived from IP.
--  * 002 already created app.listings / app.listing_interests (a first, simpler sketch that no
--    code uses). Migrations are append-only, so the real marketplace is `market_*` and the 002
--    tables are left alone; do not build on them. Notifications and the outbox from 002 are reused.
--  * Money is numeric, never real. Timestamps are timestamptz (UTC). Ids are uuid.
--  * Quantity accounting is enforced by the database: reserved_quantity + sold_quantity can never
--    exceed quantity (no overselling, even under concurrent accepts).
--  * Offer revisions and market_events are append-only (trigger + the app role has no UPDATE/DELETE).
--  * latitude/longitude are PRIVATE columns. Public queries must return public_location_label only.
--  * The four-digit pickup code is NOT stored. The service derives it as HMAC(secret, deal_id)
--    truncated to 4 digits, so the buyer can be shown it and the seller can be verified against it;
--    the table only tracks failed attempts and the lockout.
BEGIN;

-- ---------------------------------------------------------------- listings (Sell Produce)
CREATE TABLE app.market_listings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id           uuid NOT NULL REFERENCES app.users(id),
  crop_id             uuid NOT NULL REFERENCES app.crops(id),
  variety             text CHECK (variety IS NULL OR char_length(variety) BETWEEN 1 AND 40),
  quantity            numeric(12,3) NOT NULL CHECK (quantity > 0),
  reserved_quantity   numeric(12,3) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  sold_quantity       numeric(12,3) NOT NULL DEFAULT 0 CHECK (sold_quantity >= 0),
  unit                text NOT NULL CHECK (unit IN ('kg', 'bag', 'crate', 'quintal', 'ton')),
  pricing_mode        text NOT NULL CHECK (pricing_mode IN ('fixed', 'negotiable', 'request_offers')),
  asking_price        numeric(14,2) CHECK (asking_price >= 0),
  currency_code       char(3) NOT NULL,
  grade               text NOT NULL DEFAULT 'not_graded' CHECK (grade IN ('A', 'B', 'C', 'not_graded')),
  available_date      date NOT NULL,
  fulfillment         text NOT NULL CHECK (fulfillment IN ('pickup', 'seller_delivery', 'negotiable')),
  region_id           uuid NOT NULL REFERENCES app.regions(id),
  latitude            numeric(8,5) CHECK (latitude BETWEEN -90 AND 90),
  longitude           numeric(8,5) CHECK (longitude BETWEEN -180 AND 180),
  public_location_label text NOT NULL CHECK (char_length(public_location_label) BETWEEN 1 AND 80),
  status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'partially_reserved', 'reserved', 'sold', 'expired', 'removed')),
  expires_at          timestamptz NOT NULL,
  is_demo             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (reserved_quantity + sold_quantity <= quantity),
  CHECK (pricing_mode = 'request_offers' OR asking_price IS NOT NULL),
  CHECK (expires_at > created_at),
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX market_listings_feed_idx
  ON app.market_listings (region_id, crop_id, available_date, created_at DESC)
  WHERE status IN ('open', 'partially_reserved');
CREATE INDEX market_listings_seller_idx ON app.market_listings (seller_id, created_at DESC);
CREATE INDEX market_listings_expiry_idx ON app.market_listings (expires_at)
  WHERE status IN ('open', 'partially_reserved');

-- ---------------------------------------------------------------- buyer requests
CREATE TABLE app.market_buy_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id            uuid NOT NULL REFERENCES app.users(id),
  crop_id             uuid NOT NULL REFERENCES app.crops(id),
  variety             text CHECK (variety IS NULL OR char_length(variety) BETWEEN 1 AND 40),
  desired_grade       text NOT NULL DEFAULT 'not_specified'
                        CHECK (desired_grade IN ('A', 'B', 'C', 'not_specified')),
  quantity            numeric(12,3) NOT NULL CHECK (quantity > 0),
  reserved_quantity   numeric(12,3) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  fulfilled_quantity  numeric(12,3) NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0),
  unit                text NOT NULL CHECK (unit IN ('kg', 'bag', 'crate', 'quintal', 'ton')),
  target_price_min    numeric(14,2) CHECK (target_price_min >= 0),
  target_price_max    numeric(14,2) CHECK (target_price_max >= 0),
  currency_code       char(3) NOT NULL,
  needed_by           date NOT NULL,
  fulfillment         text NOT NULL CHECK (fulfillment IN ('buyer_pickup', 'seller_delivery', 'negotiable')),
  region_id           uuid NOT NULL REFERENCES app.regions(id),
  latitude            numeric(8,5) CHECK (latitude BETWEEN -90 AND 90),
  longitude           numeric(8,5) CHECK (longitude BETWEEN -180 AND 180),
  public_location_label text NOT NULL CHECK (char_length(public_location_label) BETWEEN 1 AND 80),
  status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'partially_reserved', 'matched', 'expired', 'removed')),
  expires_at          timestamptz NOT NULL,
  is_demo             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (reserved_quantity + fulfilled_quantity <= quantity),
  CHECK (target_price_min IS NULL OR target_price_max IS NULL OR target_price_max >= target_price_min),
  CHECK (expires_at > created_at),
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX market_buy_requests_feed_idx
  ON app.market_buy_requests (region_id, crop_id, needed_by, created_at DESC)
  WHERE status IN ('open', 'partially_reserved');
CREATE INDEX market_buy_requests_buyer_idx ON app.market_buy_requests (buyer_id, created_at DESC);

-- ---------------------------------------------------------------- offers + immutable revisions
-- An offer targets exactly one listing (proposer = buyer) or one buy request (proposer = seller).
-- Only current_revision moves; a counter-offer INSERTs a new revision and never edits an old one.
CREATE TABLE app.market_offers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       uuid REFERENCES app.market_listings(id),
  buy_request_id   uuid REFERENCES app.market_buy_requests(id),
  proposer_id      uuid NOT NULL REFERENCES app.users(id),
  recipient_id     uuid NOT NULL REFERENCES app.users(id),
  current_revision integer NOT NULL DEFAULT 1 CHECK (current_revision >= 1),
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'countered', 'accepted', 'declined', 'withdrawn', 'expired')),
  expires_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((listing_id IS NOT NULL) <> (buy_request_id IS NOT NULL)),
  CHECK (proposer_id <> recipient_id)
);
-- One live negotiation per user per target; a declined/expired one does not block a fresh offer.
CREATE UNIQUE INDEX market_offers_one_live_listing_idx
  ON app.market_offers (listing_id, proposer_id)
  WHERE listing_id IS NOT NULL AND status IN ('open', 'countered');
CREATE UNIQUE INDEX market_offers_one_live_request_idx
  ON app.market_offers (buy_request_id, proposer_id)
  WHERE buy_request_id IS NOT NULL AND status IN ('open', 'countered');
CREATE INDEX market_offers_listing_idx ON app.market_offers (listing_id, created_at DESC) WHERE listing_id IS NOT NULL;
CREATE INDEX market_offers_request_idx ON app.market_offers (buy_request_id, created_at DESC) WHERE buy_request_id IS NOT NULL;
CREATE INDEX market_offers_proposer_idx ON app.market_offers (proposer_id, updated_at DESC);
CREATE INDEX market_offers_recipient_idx ON app.market_offers (recipient_id, updated_at DESC);

CREATE TABLE app.market_offer_revisions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id            uuid NOT NULL REFERENCES app.market_offers(id),
  revision_number     integer NOT NULL CHECK (revision_number >= 1),
  proposed_by         uuid NOT NULL REFERENCES app.users(id),
  quantity            numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price          numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  currency_code       char(3) NOT NULL,
  pickup_date         date NOT NULL,
  pickup_window_start time,
  pickup_window_end   time,
  payment_method      text NOT NULL
                        CHECK (payment_method IN ('cash_on_pickup', 'external_mobile_money',
                                                  'external_bank_transfer', 'pay_after_delivery')),
  note                text CHECK (note IS NULL OR char_length(note) <= 160),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, revision_number),
  CHECK (pickup_window_start IS NULL OR pickup_window_end IS NULL OR pickup_window_end > pickup_window_start)
);

-- ---------------------------------------------------------------- deals
CREATE TABLE app.market_deals (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id                 uuid NOT NULL UNIQUE REFERENCES app.market_offers(id),
  offer_revision_id        uuid NOT NULL REFERENCES app.market_offer_revisions(id),
  listing_id               uuid REFERENCES app.market_listings(id),
  buy_request_id           uuid REFERENCES app.market_buy_requests(id),
  buyer_id                 uuid NOT NULL REFERENCES app.users(id),
  seller_id                uuid NOT NULL REFERENCES app.users(id),
  -- Agreed terms are copied here so later listing edits cannot change a deal. quantity/unit_price
  -- are real columns (not only JSON) so reservation math and reports do not parse JSON.
  quantity                 numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price               numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  currency_code            char(3) NOT NULL,
  estimated_total          numeric(16,2) NOT NULL CHECK (estimated_total >= 0),
  terms_snapshot           jsonb NOT NULL,
  buyer_confirmed_at       timestamptz,
  seller_confirmed_at      timestamptz,
  pickup_date              date,
  pickup_window_start      time,
  pickup_window_end        time,
  pickup_location_private  text CHECK (pickup_location_private IS NULL OR char_length(pickup_location_private) <= 120),
  pickup_code_attempts     smallint NOT NULL DEFAULT 0 CHECK (pickup_code_attempts >= 0),
  pickup_code_locked_until timestamptz,
  handover_verified_at     timestamptz,
  buyer_received_at        timestamptz,
  seller_payment_status    text CHECK (seller_payment_status IN ('pending', 'received', 'not_applicable')),
  seller_payment_updated_at timestamptz,
  status                   text NOT NULL DEFAULT 'awaiting_confirmation'
                             CHECK (status IN ('awaiting_confirmation', 'agreed', 'pickup_scheduled',
                                               'handed_over', 'completed', 'cancelled', 'no_show', 'disputed')),
  cancelled_by             uuid REFERENCES app.users(id),
  cancel_reason            text CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 160),
  completed_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (buyer_id <> seller_id),
  CHECK ((listing_id IS NOT NULL) <> (buy_request_id IS NOT NULL)),
  -- State-machine guards the database can check on the row itself. Transitions are still the
  -- service's job (inside a transaction, with SELECT ... FOR UPDATE on the deal).
  CHECK (status IN ('awaiting_confirmation', 'cancelled', 'no_show', 'disputed')
         OR (buyer_confirmed_at IS NOT NULL AND seller_confirmed_at IS NOT NULL)),
  CHECK (status NOT IN ('pickup_scheduled', 'handed_over', 'completed') OR pickup_date IS NOT NULL),
  CHECK (status NOT IN ('handed_over', 'completed') OR handover_verified_at IS NOT NULL),
  CHECK (status <> 'completed' OR (buyer_received_at IS NOT NULL AND seller_payment_status IS NOT NULL
                                   AND completed_at IS NOT NULL)),
  CHECK (status <> 'cancelled' OR (cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL))
);
CREATE INDEX market_deals_buyer_idx ON app.market_deals (buyer_id, updated_at DESC);
CREATE INDEX market_deals_seller_idx ON app.market_deals (seller_id, updated_at DESC);
CREATE INDEX market_deals_listing_idx ON app.market_deals (listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX market_deals_request_idx ON app.market_deals (buy_request_id) WHERE buy_request_id IS NOT NULL;

-- Ratings only between the two parties of a completed deal, once each.
CREATE TABLE app.market_ratings (
  deal_id    uuid NOT NULL REFERENCES app.market_deals(id),
  rater_id   uuid NOT NULL REFERENCES app.users(id),
  ratee_id   uuid NOT NULL REFERENCES app.users(id),
  stars      smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, rater_id),
  CHECK (rater_id <> ratee_id)
);
CREATE INDEX market_ratings_ratee_idx ON app.market_ratings (ratee_id);

CREATE FUNCTION app.market_check_rating() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d app.market_deals;
BEGIN
  SELECT * INTO d FROM app.market_deals WHERE id = NEW.deal_id;
  IF d.status <> 'completed' THEN
    RAISE EXCEPTION 'ratings require a completed deal' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ((NEW.rater_id = d.buyer_id AND NEW.ratee_id = d.seller_id)
       OR (NEW.rater_id = d.seller_id AND NEW.ratee_id = d.buyer_id)) THEN
    RAISE EXCEPTION 'rating must be between the two deal parties' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER market_ratings_check BEFORE INSERT ON app.market_ratings
  FOR EACH ROW EXECUTE FUNCTION app.market_check_rating();

-- ---------------------------------------------------------------- safety
CREATE TABLE app.market_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES app.users(id),
  target_type text NOT NULL CHECK (target_type IN ('listing', 'buy_request', 'offer', 'deal', 'user')),
  target_id   uuid NOT NULL,
  reason_code text NOT NULL CHECK (reason_code IN ('spam', 'scam', 'prohibited_item', 'fake_price',
                                                   'harassment', 'no_show', 'other')),
  details     text CHECK (details IS NULL OR char_length(details) <= 200),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX market_reports_open_idx ON app.market_reports (created_at) WHERE status = 'open';

CREATE TABLE app.market_blocks (
  blocker_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX market_blocks_blocked_idx ON app.market_blocks (blocked_id);

-- Client-generated idempotency keys: a retried POST returns the first result.
CREATE TABLE app.market_request_ids (
  user_id    uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  request_id text NOT NULL CHECK (char_length(request_id) BETWEEN 8 AND 80),
  kind       text NOT NULL,
  result_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);

-- ---------------------------------------------------------------- audit trail (append-only)
CREATE TABLE app.market_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('listing', 'buy_request', 'offer', 'deal', 'user')),
  entity_id   uuid NOT NULL,
  actor_id    uuid REFERENCES app.users(id),
  event_type  text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_events_entity_idx ON app.market_events (entity_type, entity_id, id);

CREATE FUNCTION app.market_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER market_offer_revisions_append_only BEFORE UPDATE OR DELETE ON app.market_offer_revisions
  FOR EACH ROW EXECUTE FUNCTION app.market_append_only();
CREATE TRIGGER market_events_append_only BEFORE UPDATE OR DELETE ON app.market_events
  FOR EACH ROW EXECUTE FUNCTION app.market_append_only();

-- ---------------------------------------------------------------- reuse 002 notifications
ALTER TABLE app.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE app.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('listing_interest', 'listing_status', 'forum_reply', 'price_alert', 'task', 'system',
                  'market_offer', 'market_deal'));

-- ---------------------------------------------------------------- privileges
-- Tables created by `postgres` do not inherit the migrator's default privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  app.market_listings, app.market_buy_requests, app.market_offers, app.market_deals,
  app.market_ratings, app.market_reports, app.market_blocks, app.market_request_ids
TO agrilink_app;
-- History is insert-only for the application role.
GRANT SELECT, INSERT ON app.market_offer_revisions, app.market_events TO agrilink_app;
GRANT USAGE, SELECT ON SEQUENCE app.market_events_id_seq TO agrilink_app;

COMMIT;
