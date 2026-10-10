-- 阶段三 · 部署后迁移（仅在生产环境已运行阶段三代码之后执行：npm run db:migrate:post-deploy）
-- 删除阶段二的全表昵称唯一约束，只保留 002 中创建的“活跃成员昵称唯一”部分唯一索引，
-- 这样成员退出后，其他人（或本人重新加入）可以使用相同昵称；已退出成员的历史记录不受影响。
-- 幂等：可重复执行。回滚见 README“回滚说明”。
CREATE UNIQUE INDEX IF NOT EXISTS members_trip_active_name_idx ON members (trip_id, display_name) WHERE left_at IS NULL;
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_trip_name_unique;
