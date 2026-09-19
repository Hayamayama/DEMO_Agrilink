-- Identity is deliberately keypad-first: an account is a verified-format phone
-- number represented by a keyed lookup hash, plus a six digit PIN hashed with
-- scrypt. Raw phone numbers and PINs are never persisted.
BEGIN;

ALTER TABLE app.users
  ADD COLUMN role text NOT NULL DEFAULT 'member',
  ADD CONSTRAINT users_role_check CHECK (role IN ('member', 'admin'));

CREATE TABLE app.auth_credentials (
  user_id          uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  login_hash       text NOT NULL UNIQUE,
  pin_hash         text NOT NULL,
  failed_attempts  smallint NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until     timestamptz,
  pin_changed_at   timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.auth_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  secret_hash      text NOT NULL,
  expires_at       timestamptz NOT NULL,
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz
);
CREATE INDEX auth_sessions_active_user_idx ON app.auth_sessions(user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE app.app_settings (
  key              text PRIMARY KEY,
  value            jsonb NOT NULL,
  updated_by       uuid REFERENCES app.users(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (key IN ('maintenance_mode', 'welcome_message'))
);
INSERT INTO app.app_settings (key, value) VALUES
  ('maintenance_mode', 'false'::jsonb),
  ('welcome_message', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE app.admin_audit_log (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id         uuid NOT NULL REFERENCES app.users(id),
  action           text NOT NULL,
  target_user_id   uuid REFERENCES app.users(id),
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_idx ON app.admin_audit_log(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.auth_credentials, app.auth_sessions,
  app.app_settings, app.admin_audit_log TO agrilink_app;
GRANT USAGE, SELECT ON SEQUENCE app.admin_audit_log_id_seq TO agrilink_app;

COMMIT;
