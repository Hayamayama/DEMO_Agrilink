BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION agrilink_migrator;

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
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code   text NOT NULL UNIQUE,
  name   text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE app.user_crops (
  user_id    uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  crop_id    uuid NOT NULL REFERENCES app.crops(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, crop_id)
);
CREATE INDEX user_crops_crop_idx ON app.user_crops(crop_id);

GRANT USAGE ON SCHEMA app TO agrilink_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO agrilink_app;
ALTER DEFAULT PRIVILEGES FOR ROLE agrilink_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agrilink_app;

COMMIT;
