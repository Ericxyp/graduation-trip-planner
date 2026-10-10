-- 毕业搭子局 · 阶段三：成员退出、发起人恢复、邀请管理、实际费用台账、操作记录、持久化限流
-- 幂等：全部使用 IF NOT EXISTS / IF EXISTS，可重复执行；不删除任何阶段二数据。
-- 约定：不含函数/DO 块，语句以“;+换行”结尾，便于 scripts/migrate.ts 逐条在同一事务中执行。

-- 1. 成员软删除：left_at 非空表示已退出
ALTER TABLE members ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

-- 活跃成员昵称唯一：部分唯一索引（left_at IS NULL）。
-- 注意：这里**不删除**阶段二的 members_trip_name_unique 约束——线上阶段二代码的加入语句
-- 依赖 “ON CONFLICT ON CONSTRAINT members_trip_name_unique”，提前删除会让生产环境加入失败。
-- 等生产环境切换到阶段三代码后，再执行 db/migrations/post-deploy/003_drop_legacy_name_unique.sql。
CREATE UNIQUE INDEX IF NOT EXISTS members_trip_active_name_idx ON members (trip_id, display_name) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS members_trip_active_idx ON members (trip_id) WHERE left_at IS NULL;

-- 2. 旅行局：恢复码哈希、邀请暂停与版本、全局修订号
ALTER TABLE trips ADD COLUMN IF NOT EXISTS recovery_code_hash VARCHAR(128);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS invite_paused BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS invite_version INTEGER NOT NULL DEFAULT 0 CHECK (invite_version >= 0);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0);

-- 3. 任务负责人：锁定时固化，成员退出时只重新分配其名下任务
ALTER TABLE trip_state ADD COLUMN IF NOT EXISTS assignments JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 4. 多设备会话：发起人通过恢复码在新设备获得的会话（旧 token 保持有效）
CREATE TABLE IF NOT EXISTS member_sessions (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  kind VARCHAR(16) NOT NULL DEFAULT 'recovery',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT member_sessions_kind_allowed CHECK (kind IN ('recovery'))
);
CREATE INDEX IF NOT EXISTS member_sessions_member_idx ON member_sessions (member_id) WHERE revoked_at IS NULL;

-- 5. 实际费用台账（金额一律为整数“分”）
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title VARCHAR(40) NOT NULL,
  category VARCHAR(16) NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_by_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  split_method VARCHAR(16) NOT NULL,
  created_by_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT expenses_amount_range CHECK (amount_cents > 0 AND amount_cents <= 10000000),
  CONSTRAINT expenses_category_allowed CHECK (category IN ('transport', 'stay', 'food', 'ticket', 'local', 'other')),
  CONSTRAINT expenses_split_allowed CHECK (split_method IN ('equal_all', 'equal_selected', 'custom')),
  CONSTRAINT expenses_version_nonneg CHECK (version >= 0)
);
CREATE INDEX IF NOT EXISTS expenses_trip_active_idx ON expenses (trip_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS expense_shares (
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  share_cents INTEGER NOT NULL,
  PRIMARY KEY (expense_id, member_id),
  CONSTRAINT expense_shares_nonneg CHECK (share_cents >= 0)
);
CREATE INDEX IF NOT EXISTS expense_shares_member_idx ON expense_shares (member_id);

-- 6. 旅行局动态：只保存脱敏后的摘要（昵称、城市、金额、标题），不保存偏好原文与任何秘密
CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  type VARCHAR(32) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT activity_payload_object CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX IF NOT EXISTS activity_events_trip_idx ON activity_events (trip_id, id DESC);

-- 7. 持久化限流（跨 Vercel 实例）：bucket_key 为 HMAC 后的值，不含原始 IP / token / 恢复码
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key VARCHAR(128) PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT rate_limits_count_nonneg CHECK (count >= 0)
);
CREATE INDEX IF NOT EXISTS rate_limits_expires_idx ON rate_limits (expires_at);
