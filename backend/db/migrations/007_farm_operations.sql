-- Today's Farm: farm-scoped operations, scheduling, workforce and records.
-- PostgreSQL is authoritative; all timestamps are timestamptz and local_date is
-- the farm-calendar date used for grouping on keypad devices.
BEGIN;

CREATE TABLE app.farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  owner_user_id uuid NOT NULL REFERENCES app.users(id),
  country_code char(2) NOT NULL,
  region_code text NOT NULL,
  timezone text NOT NULL,
  latitude numeric(8,5),
  longitude numeric(8,5),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE app.farm_members (
  farm_id uuid NOT NULL REFERENCES app.farms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'worker', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'declined', 'removed')),
  invited_by uuid REFERENCES app.users(id),
  invited_at timestamptz,
  accepted_at timestamptz,
  removed_at timestamptz,
  PRIMARY KEY (farm_id, user_id)
);
CREATE INDEX farm_members_user_idx ON app.farm_members(user_id, status);

CREATE TABLE app.farm_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES app.farms(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  area_value numeric(12,3) CHECK (area_value IS NULL OR area_value > 0),
  area_unit text CHECK (area_unit IS NULL OR area_unit IN ('ha', 'acre', 'm2')),
  irrigation_type text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, name)
);

CREATE TABLE app.crop_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES app.farms(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES app.farm_fields(id),
  crop_code text NOT NULL,
  variety text,
  planting_date date NOT NULL,
  target_harvest_date date,
  actual_harvest_date date,
  stage text,
  template_version integer,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('planned', 'active', 'harvested', 'cancelled', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crop_cycles_field_idx ON app.crop_cycles(field_id, status);

CREATE TABLE app.farm_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES app.farms(id) ON DELETE CASCADE,
  name text NOT NULL,
  crop_code text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  type text NOT NULL,
  title_template text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  default_duration_minutes integer CHECK (default_duration_minutes IS NULL OR default_duration_minutes > 0),
  offset_days integer,
  recurrence jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  completion_schema text,
  weather_constraints jsonb,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.farm_task_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES app.farms(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES app.users(id),
  recurrence jsonb NOT NULL,
  timezone text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  generation_horizon_days integer NOT NULL DEFAULT 60 CHECK (generation_horizon_days BETWEEN 1 AND 366),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.farm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text,
  farm_id uuid NOT NULL REFERENCES app.farms(id) ON DELETE CASCADE,
  field_id uuid REFERENCES app.farm_fields(id),
  crop_cycle_id uuid REFERENCES app.crop_cycles(id),
  template_id uuid REFERENCES app.farm_task_templates(id),
  template_version integer,
  series_id uuid REFERENCES app.farm_task_series(id),
  occurrence_key text,
  created_by uuid NOT NULL REFERENCES app.users(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  type text NOT NULL CHECK (type IN ('inspection','irrigation','fertilizer','spraying','weeding','planting','harvest','machinery','livestock','transport','market','record','custom')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft','scheduled','assigned','accepted','in_progress','completed','verified','skipped','delayed','blocked','cancelled')),
  is_all_day boolean NOT NULL DEFAULT false,
  local_date date NOT NULL,
  start_at timestamptz,
  due_at timestamptz,
  timezone text NOT NULL,
  estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  verification_required boolean NOT NULL DEFAULT false,
  weather_constraints jsonb,
  blocked_reason text,
  delayed_reason text,
  cancelled_reason text,
  completed_at timestamptz,
  verified_at timestamptz,
  verified_by uuid REFERENCES app.users(id),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, created_by, request_id),
  UNIQUE (series_id, occurrence_key),
  CHECK (due_at IS NULL OR start_at IS NULL OR due_at >= start_at)
);
CREATE INDEX farm_tasks_today_idx ON app.farm_tasks(farm_id, local_date, status, priority);
CREATE INDEX farm_tasks_due_idx ON app.farm_tasks(farm_id, due_at, status);

CREATE TABLE app.farm_task_assignments (
  task_id uuid NOT NULL REFERENCES app.farm_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id),
  assignment_role text NOT NULL DEFAULT 'primary' CHECK (assignment_role IN ('primary', 'helper')),
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'accepted', 'declined', 'completed', 'removed')),
  assigned_by uuid NOT NULL REFERENCES app.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX farm_task_assignments_user_idx ON app.farm_task_assignments(user_id, status);

CREATE TABLE app.farm_task_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES app.farm_tasks(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
  sort_order integer NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  completed_at timestamptz,
  completed_by uuid REFERENCES app.users(id)
);

CREATE TABLE app.farm_task_dependencies (
  task_id uuid NOT NULL REFERENCES app.farm_tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES app.farm_tasks(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'finish_before_start',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE app.farm_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES app.farm_tasks(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES app.users(id),
  event_type text NOT NULL,
  from_status text,
  to_status text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX farm_task_events_task_idx ON app.farm_task_events(task_id, created_at);

CREATE TABLE app.farm_task_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL UNIQUE REFERENCES app.farm_tasks(id) ON DELETE CASCADE,
  completed_by uuid NOT NULL REFERENCES app.users(id),
  result_code text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  actual_start_at timestamptz,
  actual_finish_at timestamptz,
  labor_minutes integer CHECK (labor_minutes IS NULL OR labor_minutes >= 0),
  weather_snapshot jsonb,
  problem_flag boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  corrected_at timestamptz,
  corrected_by uuid REFERENCES app.users(id),
  correction_reason text
);

CREATE TABLE app.farm_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES app.farms(id) ON DELETE CASCADE,
  field_id uuid REFERENCES app.farm_fields(id),
  crop_cycle_id uuid REFERENCES app.crop_cycles(id),
  task_id uuid REFERENCES app.farm_tasks(id),
  actor_user_id uuid REFERENCES app.users(id),
  record_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  local_date date NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision_of uuid REFERENCES app.farm_records(id),
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX farm_records_farm_date_idx ON app.farm_records(farm_id, local_date DESC);

CREATE TABLE app.farm_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES app.farms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  task_id uuid REFERENCES app.farm_tasks(id) ON DELETE CASCADE,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX farm_notifications_dedupe_idx ON app.farm_notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE app.farm_weather_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES app.farms(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'open-meteo',
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX farm_weather_snapshots_latest_idx ON app.farm_weather_snapshots(farm_id, fetched_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  app.farms, app.farm_members, app.farm_fields, app.crop_cycles,
  app.farm_task_templates, app.farm_task_series, app.farm_tasks,
  app.farm_task_assignments, app.farm_task_checklist_items,
  app.farm_task_dependencies, app.farm_task_events, app.farm_task_results,
  app.farm_records, app.farm_notifications, app.farm_weather_snapshots
TO agrilink_app;

COMMIT;
