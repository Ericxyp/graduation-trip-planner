# 毕业搭子局

毕业旅行多人共识助手：每个人私下填写真实偏好，系统找到最大公约数，给出可解释的组队、行程与 AA 方案。

- 生产域名：https://biye-dazi-ju.vercel.app（Vercel 项目 `biye-dazi-ju`，请勿新建项目）
- 技术栈：React 18 + Vite 6 + TypeScript + Tailwind CSS v4 + lucide-react；Vercel Functions + Neon Postgres

## 两种模式

| | 演示模式 `demo` | 云端模式 `cloud` |
|---|---|---|
| 入口 | `/`（固定示例“2027届毕业旅行”） | `/create`、`/trip/:slug`、`/trip/:slug/join` |
| 数据 | 本地模拟数据 + localStorage（`biye-dazi-ju:v1`） | Neon Postgres，经 `/api/*` 读写 |
| 共识计算 | 浏览器内 `src/logic.ts` | 服务端 `src/shared/consensus.ts`（权威结果） |
| 无数据库时 | 完整可用 | 创建入口提示“云端功能尚未配置”，接口返回 503，不伪装成功 |

两种模式的存储完全隔离：云端只使用 `grad-trip:identity:<slug>`、`grad-trip:invite:<slug>`、`grad-trip:snapshot:<slug>`，不会读写演示状态；首次访问引导只在演示首页出现。

## 架构

```
src/
  App.tsx, components/      演示模式（阶段一，未改动交互）
  router.ts, main.tsx       轻量路由（不引入 React Router），云端页面按需加载
  cloud/                    云端页面：创建、加入、旅行局、轮询同步、API 客户端
  shared/                   前后端共享（不含任何浏览器/服务端专属依赖）
    weights.ts              五维权重 40/20/20/10/10（演示与云端共用）
    options.ts              偏好选项
    consensus.ts            计算层（人数/预算/匹配度/冲突）+ 解释层（规则模板）
    destinations.ts         目的地费用画像（确定性估算）
    types.ts                API 契约（DTO）
    schemas.ts              zod 输入校验（仅服务端引用，不进浏览器包）
api/
  router.ts                 /api/trips/* 的唯一入口（Web 标准 Request → Response）
  health.ts                 /api/health
server/                     服务端：路由、业务、权限、SQL、令牌、限流（只在 api/ 中引用）
db/migrations/001_initial.sql
scripts/migrate.ts
tests/                      单元测试 + API 集成测试
```

`vercel.json` 把 `/api/trips` 与 `/api/trips/*` 重写到 `api/router`（通过 `?__path=` 传原始路径）；SPA 回退规则 `/((?!api/).*)` 不会吞掉 `/api/*`。

### API

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/health` | 公开 | 数据库与密钥配置状态；未配置返回 503 |
| POST | `/api/trips` | 公开（限流） | 创建旅行局，只在此响应中返回一次发起人 token 与邀请码 |
| GET | `/api/trips/:slug/public` | 公开 | 公开摘要（名称、发起人、城市、日期、人数） |
| POST | `/api/trips/:slug/join` | 邀请码（限流） | 加入，返回成员 token |
| GET | `/api/trips/:slug` | 成员 | 共享状态：成员填写状态、共识方案、锁定方案、任务、付款 |
| GET | `/api/trips/:slug/consensus` | 成员 | 只取共识结果 |
| PUT | `/api/trips/:slug/preferences/me` | 成员 | 新增/修改**自己的**偏好 |
| PATCH | `/api/trips/:slug/state` | 成员 | `op: task`（负责人或发起人）/ `op: paid`（只能改自己），需 `expectedVersion` |
| POST | `/api/trips/:slug/lock` | 发起人 | 锁定/解锁团队方案，需 `expectedVersion` |
| DELETE | `/api/trips/:slug/members/:id` | 发起人 | 移除成员（阶段三起为软删除，并触发重算） |
| POST | `/api/trips/:slug/leave` | 成员 | 主动退出（发起人不可直接退出；重复调用幂等返回 `already_left`） |
| POST | `/api/trips/:slug/transfer-organizer` | 发起人 | 转让发起人身份 `{ memberId }`，同时清除旧恢复码 |
| POST | `/api/trips/:slug/archive` | 发起人 | 解散旅行局（只读） |
| POST | `/api/trips/:slug/recover-organizer` | 恢复码（数据库级限流） | 请求体 `{ recoveryCode }`，签发新的发起人会话，旧 token 保持有效 |
| POST | `/api/trips/:slug/recovery-code` | 发起人 | 生成/重新生成恢复码（只返回一次，旧码失效） |
| PATCH | `/api/trips/:slug/invite` | 发起人 | `action: regenerate / pause / resume / deadline`，需 `expectedInviteVersion` |
| GET | `/api/trips/:slug/expenses` | 成员 | 实际费用台账（明细、每人收支、最少转账） |
| POST | `/api/trips/:slug/expenses` | 成员（方案锁定后） | 新增费用 |
| PATCH / DELETE | `/api/trips/:slug/expenses/:id` | 记录人 / 垫付人 / 发起人 | 修改（需 `expectedVersion`）/ 软删除 |

错误统一为 `{ "error": { "code", "message" } }`，code 包括 `INVALID_INPUT / UNAUTHORIZED / FORBIDDEN / TRIP_NOT_FOUND / INVALID_INVITE_CODE / INVITE_EXPIRED / INVITE_PAUSED / MEMBER_LIMIT_REACHED / DISPLAY_NAME_TAKEN / VERSION_CONFLICT / RATE_LIMITED / MEMBER_LEFT / ORGANIZER_CANNOT_LEAVE / INVALID_RECOVERY_CODE / EXPENSE_NOT_FOUND / NOT_LOCKED / TRIP_ARCHIVED / NOT_CONFIGURED / DATABASE_UNAVAILABLE / INTERNAL_ERROR`。429 带 `Retry-After`。

阶段三对阶段二客户端完全向后兼容：所有旧接口与旧字段保留，`TripView` 只新增 `admin / ledger / activity`，`PublicTrip` 只新增 `inviteStatus`。

### 数据库表

- `trips`：旅行局（`slug` 唯一；`invite_code_hash`、`organizer_token_hash` 只存哈希；约束：人数 2–30、结束日期 ≥ 开始日期、status ∈ collecting/locked/archived）
- `members`：成员（`member_token_hash` 唯一索引；`UNIQUE(trip_id, display_name)`；role ∈ organizer/member，每局仅 1 位发起人）
- `preferences`：每位成员一条偏好（`member_id` 唯一）
- `trip_state`：共享状态（选中/锁定方案、任务、付款、退出成员、`version` 乐观锁）
- `schema_migrations`：迁移记录

阶段三（`db/migrations/002_stage_three.sql`，幂等，不修改 001，不删除数据）：

- `members.left_at`：软删除；新增**部分唯一索引** `(trip_id, display_name) WHERE left_at IS NULL`（活跃成员昵称唯一）。为保证线上阶段二代码不受影响，002 **保留**阶段二的全表昵称约束；生产切换到阶段三代码后再执行部署后迁移 `db/migrations/post-deploy/003_drop_legacy_name_unique.sql`（`npm run db:migrate:post-deploy`），之后退出者不再占用昵称
- `trips`：`recovery_code_hash`、`invite_paused`、`invite_version`（邀请设置乐观锁）、`revision`（全局修订号）
- `trip_state.assignments`：锁定时固化的任务负责人（key → memberId）
- `member_sessions`：多设备会话（发起人恢复后新增，`token_hash` 唯一，可单独吊销）
- `expenses` / `expense_shares`：整数“分”，金额 1–10,000,000 分，类别/分摊方式 CHECK，软删除 `deleted_at`，`version` 乐观锁
- `activity_events`：动态（只存白名单字段的脱敏摘要）
- `rate_limits`：持久化限流（`bucket_key` 为 HMAC 值）

所有外键 `ON DELETE CASCADE`（动态的操作人 `ON DELETE SET NULL`）；`npm run db:migrate` 按文件名顺序执行全部迁移，已执行的记录在 `schema_migrations`。

**兼容性与回滚说明（不会自动执行）**：

- 已验证：阶段二代码（e715a84）的全部 API 测试在执行过 001 + 002 的数据库上通过，因此可以先迁移、再部署 Preview，生产环境的阶段二代码不受影响。
- 注意：阶段二代码不认识 `left_at`。在共用数据库上，Preview 中退出的成员在阶段二生产环境里仍显示为成员（仅影响在 Preview 中操作过的旅行局）。
- 代码回滚到阶段二：只要**没有执行**部署后迁移 003，直接回滚即可，新增列与表不影响旧版本。
- 若已执行 003 又要回滚到阶段二：需手动恢复约束（先确认同一旅行局内没有重名成员）：
  `ALTER TABLE members ADD CONSTRAINT members_trip_name_unique UNIQUE (trip_id, display_name);`
- 彻底移除阶段三数据（破坏性，仅在确认不需要时手动执行）：`DROP TABLE rate_limits, activity_events, expense_shares, expenses, member_sessions;` 并 `ALTER TABLE ... DROP COLUMN` 对应新增列。

### 身份、权限与隐私

- 不做账户系统：每个旅行局内的匿名成员身份。token 为 256 位随机值（`crypto.randomBytes`），邀请码 8 位（`crypto.randomInt`）。
- 数据库只保存 `HMAC-SHA256(TOKEN_PEPPER, secret)`；明文只在创建/加入响应中出现一次。
- 请求通过 `Authorization: Bearer <memberToken>` 认证，服务端按哈希查成员记录确定身份与角色；**从不信任客户端传入的 role 或 memberId**（请求体用 zod `.strict()` 拒绝未知字段）。
- 邀请链接形如 `/trip/<slug>/join#code=XXXX`：邀请码在 URL fragment 中，浏览器不会发给服务器，因此不会进入访问日志；加入页读取后立即从地址栏移除。
- **不会返回给其他成员的字段**：预算档位、必选条件、不能接受条件、可出发日期原文、任何 token/邀请码哈希。共识结果只包含聚合计数（例如“2人的预算上限被超出”）和查看者本人的得分。
- 日志只记录接口与错误类别，不记录 token、邀请码、恢复码、偏好或 SQL。
- **成员退出**：软删除（`left_at`），立即吊销其全部会话（旧 token 返回 401 `MEMBER_LEFT`）；偏好不再参与共识；历史费用记录保留。
- **发起人恢复**：创建时生成 16 位恢复码（只显示一次，数据库存 HMAC）。恢复码只通过 POST 请求体发送，不进 URL。恢复成功后新增一个会话，**旧设备 token 保持有效**；转让发起人时恢复码自动失效。
- **持久化限流**（`server/limits.ts`，存 Postgres，跨实例）：创建 10 次/10 分钟/IP；加入 10 次/10 分钟/(IP, 旅行局) 且 60 次/10 分钟/旅行局；恢复 5 次/15 分钟/(IP, 旅行局) 且 20 次/小时/旅行局；重新生成邀请码 10 次/小时/旅行局。key 为 `HMAC(TOKEN_PEPPER, scope+标识)`，表中不出现原始 IP；过期记录随请求抽样清理（`expires_at < now() - 1h`）。另保留一层进程内预过滤，减轻洪泛时的数据库压力。
- **操作记录脱敏**：每种事件有字段白名单（`src/shared/activity.ts`），写入前过滤，只保存昵称、目的地、费用标题与金额、计数；绝不保存偏好内容、token、邀请码或恢复码。文案在服务端渲染，例如“糖糖新增费用“毕业晚宴 ¥680””。

### 共识算法（服务端权威）

1. 计算层：每个候选目的地在日期范围内滑动 4 天窗口（范围不足 4 天取全长），选出可参加人数最多的窗口；按“匹配度 → 人数 → 人均”选最大共识，再分别选最省钱、最难忘（志愿热度最高）。每位已填写成员按日期 40 / 预算 20 / 目的地 20（按志愿递减）/ 节奏 10 / 住宿 10 打分，团队匹配度为平均值。触发“绝对不能接受”的成员不计入可参加人数，个人得分减半。
2. 解释层：用规则模板把上面的数字转成推荐理由、冲突与说明，不调用大模型。
3. 锁定的方案以 id（`开始日期|天数|目的地`）保存；成员之后修改偏好，锁定的目的地和日期不变，人数与费用会按最新偏好重新计算。

### 成员退出后的重算规则

1. 已锁定方案：目的地与日期**不变**，参加人数、人均费用按剩余成员重新计算；未锁定：共识方案整体重算。
2. 任务：只把退出者名下的任务重新分配给“当前任务最少的参加成员”（平局按加入顺序），其他人的任务负责人不变。
3. 实际费用：已记录的费用与分摊**不自动删除**，退出者在“每人收支”中以“已退出”保留，转账建议照常包含其应收/应补。
4. 并发：退出在同一事务中先锁 `trip_state` 行，再以 `version` 条件写入成员状态、任务分配、版本与动态；版本变化时服务端自动重算并重试（最多 4 次）。
5. 其他成员下次同步时看到变化反馈卡：“糖糖已退出旅行局 · 参加人数 3 → 2 · 人均 ¥2,863 → ¥2,790 · 4 项任务已重新分配 · 成都方案保持锁定”。

### 费用分摊算法

- 金额全程使用整数“分”；输入的“186.5”按字符串解析为 18650，不经过浮点数。
- 均摊：`base = ⌊总额 / 人数⌋`，余下的 r 分按加入顺序给前 r 人（每人至多多 1 分），合计恒等于总额。
- 自定义：服务端校验每人金额之和必须等于总额，成员必须是当前旅行局的活跃成员。
- 每人净额 = 垫付合计 − 应承担合计；最少转账采用贪心：每次让应补最多的人转给应收最多的人，金额取两者较小值，每步至少结清一人，因此笔数 ≤ 有余额人数 − 1（平局按 id 排序，结果确定）。

### 多人同步

页面可见时每 5 秒轮询 `GET /api/trips/:slug`，隐藏时降为 30 秒；窗口获得焦点、网络恢复、其他标签页广播（BroadcastChannel，只传 slug 与信号类型）时立即刷新；请求进行中不重复发起。`revision = trips.revision + trip_state.version`，未变化时不替换数据、不重渲染列表，更旧的响应直接丢弃。状态显示：已同步 / 正在同步 / 网络断开 / 本地只读快照 / 同步失败。写冲突（409）时自动拉取最新状态，并用最近动态告诉用户期间发生了什么，不静默覆盖。未使用 SSE/WebSocket：在当前环境无法可靠验证 Vercel 上的长连接，轮询更可控。

## 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `DATABASE_URL` | 是 | Neon 连接串，仅服务端读取（不要加 `VITE_` 前缀） |
| `TOKEN_PEPPER` | 强烈建议 | ≥16 位随机字符串；上线后不要更换，否则已发出的身份全部失效 |
| `APP_ORIGIN` | 否 | 邀请链接域名；不填用请求来源（Preview 自动使用预览域名） |

Vercel 中三个环境（Production / Preview / Development）分别配置：Production 指向生产库；Preview 和 Development 建议指向 Neon 的独立分支。**修改环境变量后必须重新部署才会生效。**

## 本地运行

```bash
npm install
cp .env.example .env.local        # 或 vercel env pull .env.local
# 填写 DATABASE_URL（建议用 Neon 的开发分支）与 TOKEN_PEPPER
npm run db:migrate:check          # 预检：列出待执行的迁移（不执行）
npm run db:migrate                # 执行 db/migrations/*.sql（001、002）
npx vercel dev                    # 同时运行前端与 /api（推荐）
```

- 只想看演示模式：`npm run dev`（普通 `vite dev` 不运行 Vercel Functions，云端页面会提示无法连接云端服务）。
- 检查：`npm run typecheck`、`npm run build`、`npm test`。

### 测试

- `npm test`：单元测试（不需要数据库）。`TEST_DATABASE_URL` 设置后会同时运行 API 集成测试。
- `tests/api.test.ts` 会**清空并重建**测试库，因此只允许 host 为 `localhost / 127.0.0.1 / ::1` 且库名包含 `test` 的本机库；其他地址（包括任何 Neon 连接）整组自动跳过。`tests/stage3.api.test.ts` 不删除任何表，只幂等执行迁移后创建新的旅行局。
- 测试文件串行执行（`--test-concurrency=1`），避免两组集成测试同时操作同一个库。

```bash
TEST_DATABASE_URL=postgres://dev:dev@localhost:5432/gradtrip_test npm test
```

## 部署（现有 Vercel 项目 `biye-dazi-ju`）

1. Vercel 控制台 → 项目 `biye-dazi-ju` → Storage / Marketplace → 安装 **Neon** 并把数据库连接到本项目（勾选 Development、Preview、Production）。确认 Settings → Environment Variables 中出现 `DATABASE_URL`。
2. 添加 `TOKEN_PEPPER`（三个环境都要，Preview 可与生产不同）。
3. 本地 `vercel link`（选择**已有**项目 `biye-dazi-ju`）→ `vercel env pull .env.local` → 对开发/预览分支执行 `npm run db:migrate`。
4. 推送到非 main 分支（或 `vercel` 不带 `--prod`）生成 Preview，用两个浏览器走完“创建 → 邀请 → 加入 → 双方填写 → 锁定 → 对方看到锁定”。
5. 确认 `/api/health` 返回 `{"status":"ok"}`，并确认其他成员的响应中没有预算与底线。
6. 对生产数据库执行迁移：`DATABASE_URL=<生产连接串> npm run db:migrate`（脚本会先打印目标主机）。
7. 合并到 main（或 `vercel --prod`），验证 https://biye-dazi-ju.vercel.app 。
8. 阶段三上线并验证后，再执行部署后迁移：`npm run db:migrate:post-deploy`（放开已退出成员占用的昵称）。

### 回滚

- 前端/函数：Vercel → Deployments → 选择阶段一的部署 → **Instant Rollback**（或 Promote to Production）。阶段一版本不依赖数据库，可直接回滚。
- 数据库：本次迁移只新增表，回滚代码不需要回滚数据库；需要彻底清除时手动 `DROP TABLE trip_state, preferences, members, trips, schema_migrations`。

## 已知限制

- 限流为数据库固定窗口计数（跨实例），高并发下会给数据库带来额外写入；更大规模应改用 Redis/KV。同一出口 IP（校园网 NAT）共享额度。
- 普通成员的身份只保存在浏览器 localStorage，换设备后需要重新加入（发起人可用恢复码找回；普通成员暂无恢复码）。
- 同步采用 10 秒轮询，不是实时推送。
- 目的地费用为确定性估算，不是实时报价；未收录城市使用通用画像并在方案中标注。
- 任务/付款只做状态记录，没有真实支付；“成员退出重算”目前只在演示模式中提供。
- 没有找回发起人身份、更换邀请码、审计日志等功能。
