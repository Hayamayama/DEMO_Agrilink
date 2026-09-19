-- Farmer Circle (forum). Builds on the identity tables from 001/004: authors are
-- app.users, locations are app.regions. Conventions follow 001-004 (uuid keys,
-- timestamptz, CHECK-constrained enums). Apply with the migrator role or postgres.
-- Scores are never stored: they are SUM(app.forum_votes.value).
-- forum_posts.accepted_reply_id is deliberately not a FOREIGN KEY (posts <-> replies
-- would be circular); the service checks ownership inside a transaction.
BEGIN;

-- Moderators can pin/lock/hide posts; admins already can.
ALTER TABLE app.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE app.users ADD CONSTRAINT users_role_check CHECK (role IN ('member', 'moderator', 'admin'));

CREATE TABLE app.forum_communities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text NOT NULL,
  sort_order  integer NOT NULL,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE app.forum_tags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  label        text NOT NULL,
  community_id uuid REFERENCES app.forum_communities(id) ON DELETE SET NULL,
  is_active    boolean NOT NULL DEFAULT true
);

CREATE TABLE app.forum_posts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id         uuid NOT NULL REFERENCES app.users(id),
  community_id      uuid NOT NULL REFERENCES app.forum_communities(id),
  region_id         uuid NOT NULL REFERENCES app.regions(id),
  type              text NOT NULL CHECK (type IN ('question', 'discussion', 'local_report')),
  title             text NOT NULL CHECK (char_length(title) BETWEEN 8 AND 80),
  body              text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 500),
  location_scope    text NOT NULL DEFAULT 'region' CHECK (location_scope IN ('region', 'country')),
  image_path        text,
  accepted_reply_id uuid,
  is_pinned         boolean NOT NULL DEFAULT false,
  is_locked         boolean NOT NULL DEFAULT false,
  is_hidden         boolean NOT NULL DEFAULT false,
  is_demo           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_activity_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX forum_posts_community_idx ON app.forum_posts(community_id, last_activity_at DESC);
CREATE INDEX forum_posts_region_idx    ON app.forum_posts(region_id, last_activity_at DESC);
CREATE INDEX forum_posts_author_idx    ON app.forum_posts(author_id, created_at DESC);

CREATE TABLE app.forum_post_tags (
  post_id uuid NOT NULL REFERENCES app.forum_posts(id) ON DELETE CASCADE,
  tag_id  uuid NOT NULL REFERENCES app.forum_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE app.forum_replies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid NOT NULL REFERENCES app.forum_posts(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES app.users(id),
  parent_reply_id uuid REFERENCES app.forum_replies(id) ON DELETE CASCADE,
  body            text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 400),
  is_hidden       boolean NOT NULL DEFAULT false,
  is_demo         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX forum_replies_post_idx ON app.forum_replies(post_id, created_at);

CREATE TABLE app.forum_votes (
  user_id     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post', 'reply')),
  target_id   uuid NOT NULL,
  value       smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX forum_votes_target_idx ON app.forum_votes(target_type, target_id);

CREATE TABLE app.forum_saved_posts (
  user_id    uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  post_id    uuid NOT NULL REFERENCES app.forum_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE app.forum_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES app.users(id),
  target_type text NOT NULL CHECK (target_type IN ('post', 'reply')),
  target_id   uuid NOT NULL,
  reason      text NOT NULL CHECK (reason IN ('spam', 'scam', 'harassment', 'dangerous_advice', 'false_information', 'other')),
  note        text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);

-- Client-generated idempotency keys: a retried POST returns the first result.
CREATE TABLE app.forum_request_ids (
  user_id    uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  kind       text NOT NULL,
  result_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);

CREATE TABLE app.forum_mod_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid NOT NULL REFERENCES app.users(id),
  post_id      uuid NOT NULL REFERENCES app.forum_posts(id) ON DELETE CASCADE,
  action       text NOT NULL,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Per-user forum state; kept out of app.users so that table stays identity-only.
-- demo_key marks the fictional members created by the demo seed.
CREATE TABLE app.forum_user_state (
  user_id               uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  notifications_seen_at timestamptz,
  demo_key              text UNIQUE
);

-- Tables created by `postgres` do not inherit the migrator's default privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  app.forum_communities, app.forum_tags, app.forum_posts, app.forum_post_tags, app.forum_replies,
  app.forum_votes, app.forum_saved_posts, app.forum_reports, app.forum_request_ids,
  app.forum_mod_actions, app.forum_user_state
TO agrilink_app;

COMMIT;
