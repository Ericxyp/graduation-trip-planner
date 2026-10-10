-- 毕业搭子局 · 云端旅行局初始结构
-- 幂等：可重复执行。不含函数/触发器，语句以分号+换行分隔，便于迁移脚本逐条执行。

CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY,
  slug VARCHAR(32) UNIQUE NOT NULL,
  invite_code_hash VARCHAR(128) NOT NULL,
  organizer_token_hash VARCHAR(128) NOT NULL,
  name VARCHAR(40) NOT NULL,
  origin_city VARCHAR(20) NOT NULL,
  candidate_destinations JSONB NOT NULL,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  member_limit INTEGER NOT NULL,
  invite_deadline TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL DEFAULT 'collecting',
  locked_plan_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trips_member_limit_range CHECK (member_limit BETWEEN 2 AND 30),
  CONSTRAINT trips_date_order CHECK (date_end >= date_start),
  CONSTRAINT trips_status_allowed CHECK (status IN ('collecting', 'locked', 'archived')),
  CONSTRAINT trips_candidates_array CHECK (jsonb_typeof(candidate_destinations) = 'array')
);

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  display_name VARCHAR(16) NOT NULL,
  member_token_hash VARCHAR(128) NOT NULL,
  role VARCHAR(16) NOT NULL,
  color VARCHAR(16),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT members_role_allowed CHECK (role IN ('organizer', 'member')),
  CONSTRAINT members_trip_name_unique UNIQUE (trip_id, display_name)
);

CREATE UNIQUE INDEX IF NOT EXISTS members_token_hash_idx ON members (member_token_hash);
CREATE INDEX IF NOT EXISTS members_trip_idx ON members (trip_id, joined_at);
-- 每个旅行局只有一位发起人
CREATE UNIQUE INDEX IF NOT EXISTS members_one_organizer_idx ON members (trip_id) WHERE role = 'organizer';

CREATE TABLE IF NOT EXISTS preferences (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id UUID UNIQUE NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  dates JSONB NOT NULL,
  budget_id VARCHAR(8) NOT NULL,
  destinations JSONB NOT NULL,
  pace VARCHAR(16) NOT NULL,
  stay VARCHAR(16) NOT NULL,
  musts JSONB NOT NULL,
  nos JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT preferences_pace_allowed CHECK (pace IN ('rush', 'balanced', 'relax')),
  CONSTRAINT preferences_stay_allowed CHECK (stay IN ('any', 'homestay', 'hotel', 'private-bath'))
);

CREATE INDEX IF NOT EXISTS preferences_trip_idx ON preferences (trip_id);

CREATE TABLE IF NOT EXISTS trip_state (
  trip_id UUID PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  selected_plan_id VARCHAR(64),
  locked_plan_id VARCHAR(64),
  tasks JSONB NOT NULL DEFAULT '{}'::jsonb,
  exited_members JSONB NOT NULL DEFAULT '[]'::jsonb,
  paid_members JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trip_state_version_nonneg CHECK (version >= 0)
);
