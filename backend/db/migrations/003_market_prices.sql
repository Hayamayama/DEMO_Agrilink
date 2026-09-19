-- Market Prices: mandi markets and their daily prices.
-- Conventions follow 001/002 (uuid keys, numeric money + currency_code, CHECK-constrained enums).
-- Applied by agrilink_migrator; the runner records the version in app.schema_migrations.
BEGIN;

CREATE TABLE app.markets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id  uuid NOT NULL REFERENCES app.regions(id),
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  latitude   numeric(8,5),
  longitude  numeric(8,5),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX markets_region_idx ON app.markets(region_id);

CREATE TABLE app.market_prices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id     uuid NOT NULL REFERENCES app.markets(id),
  crop_id       uuid NOT NULL REFERENCES app.crops(id),
  variety       text NOT NULL DEFAULT '',
  price_date    date NOT NULL,
  min_price     numeric(14,2),
  max_price     numeric(14,2),
  modal_price   numeric(14,2) NOT NULL,
  currency_code char(3) NOT NULL,
  price_unit    text NOT NULL,
  source        text NOT NULL,
  is_sample     boolean NOT NULL DEFAULT false,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (modal_price >= 0),
  CHECK (min_price IS NULL OR min_price >= 0),
  CHECK (max_price IS NULL OR min_price IS NULL OR max_price >= min_price),
  CHECK (char_length(price_unit) BETWEEN 1 AND 24),
  CHECK (source IN ('agmarknet', 'seed', 'manual')),
  UNIQUE (market_id, crop_id, variety, price_date)
);
CREATE INDEX market_prices_crop_date_idx ON app.market_prices (crop_id, price_date DESC);
CREATE INDEX market_prices_market_idx ON app.market_prices (market_id, crop_id, price_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.markets, app.market_prices TO agrilink_app;

COMMIT;
