-- Live farm prices, spray/community metadata, and translation cache.
BEGIN;

CREATE TABLE app.price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES app.farms(id) ON DELETE CASCADE,
  crop text NOT NULL,
  provider text NOT NULL DEFAULT 'agmarknet',
  state_name text NOT NULL,
  payload_json jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_snapshots_farm_idx ON app.price_snapshots(farm_id, crop, fetched_at DESC);

ALTER TABLE app.users ADD COLUMN is_verified_expert boolean NOT NULL DEFAULT false;
ALTER TABLE app.users ADD COLUMN expert_title text;
ALTER TABLE app.forum_posts ADD COLUMN language text NOT NULL DEFAULT 'en';
ALTER TABLE app.forum_replies ADD COLUMN language text NOT NULL DEFAULT 'en';
ALTER TABLE app.forum_replies ADD COLUMN source text NOT NULL DEFAULT 'human'
  CHECK (source IN ('human', 'ai', 'expert', 'official'));

CREATE TABLE app.translations_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('post', 'reply')),
  source_id uuid NOT NULL,
  target_lang text NOT NULL,
  translated_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_id, target_lang)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.price_snapshots, app.translations_cache TO agrilink_app;

COMMIT;
