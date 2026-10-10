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
| DELETE | `/api/trips/:slug/members/:id` | 发起人 | 移除成员 |

错误统一为 `{ "error": { "code", "message" } }`，code 包括 `INVALID_INPUT / UNAUTHORIZED / FORBIDDEN / TRIP_NOT_FOUND / INVALID_INVITE_CODE / INVITE_EXPIRED / MEMBER_LIMIT_REACHED / DISPLAY_NAME_TAKEN / VERSION_CONFLICT / RATE_LIMITED / NOT_CONFIGURED / DATABASE_UNAVAILABLE / INTERNAL_ERROR` 等。

### 数据库表

- `trips`：旅行局（`slug` 唯一；`invite_code_hash`、`organizer_token_hash` 只存哈希；约束：人数 2–30、结束日期 ≥ 开始日期、status ∈ collecting/locked/archived）
- `members`：成员（`member_token_hash` 唯一索引；`UNIQUE(trip_id, display_name)`；role ∈ organizer/member，每局仅 1 位发起人）
- `preferences`：每位成员一条偏好（`member_id` 唯一）
- `trip_state`：共享状态（选中/锁定方案、任务、付款、退出成员、`version` 乐观锁）
- `schema_migrations`：迁移记录

所有外键 `ON DELETE CASCADE`；迁移脚本幂等，可重复执行。

### 身份、权限与隐私

- 不做账户系统：每个旅行局内的匿名成员身份。token 为 256 位随机值（`crypto.randomBytes`），邀请码 8 位（`crypto.randomInt`）。
- 数据库只保存 `HMAC-SHA256(TOKEN_PEPPER, secret)`；明文只在创建/加入响应中出现一次。
- 请求通过 `Authorization: Bearer <memberToken>` 认证，服务端按哈希查成员记录确定身份与角色；**从不信任客户端传入的 role 或 memberId**（请求体用 zod `.strict()` 拒绝未知字段）。
- 邀请链接形如 `/trip/<slug>/join#code=XXXX`：邀请码在 URL fragment 中，浏览器不会发给服务器，因此不会进入访问日志；加入页读取后立即从地址栏移除。
- **不会返回给其他成员的字段**：预算档位、必选条件、不能接受条件、可出发日期原文、任何 token/邀请码哈希。共识结果只包含聚合计数（例如“2人的预算上限被超出”）和查看者本人的得分。
- 日志只记录接口与错误类别，不记录 token、邀请码、偏好或 SQL。

### 共识算法（服务端权威）

1. 计算层：每个候选目的地在日期范围内滑动 4 天窗口（范围不足 4 天取全长），选出可参加人数最多的窗口；按“匹配度 → 人数 → 人均”选最大共识，再分别选最省钱、最难忘（志愿热度最高）。每位已填写成员按日期 40 / 预算 20 / 目的地 20（按志愿递减）/ 节奏 10 / 住宿 10 打分，团队匹配度为平均值。触发“绝对不能接受”的成员不计入可参加人数，个人得分减半。
2. 解释层：用规则模板把上面的数字转成推荐理由、冲突与说明，不调用大模型。
3. 锁定的方案以 id（`开始日期|天数|目的地`）保存；成员之后修改偏好，锁定的目的地和日期不变，人数与费用会按最新偏好重新计算。

### 多人同步

可见时每 10 秒轮询一次 `GET /api/trips/:slug`；窗口重新获得焦点或网络恢复时立即刷新；请求进行中不重复发起；后台标签页暂停轮询。写操作直接使用服务端返回的最新数据。响应携带单调递增的 `revision`，旧响应会被丢弃。网络或服务端故障时显示“同步失败/离线快照”，以只读方式展示最近一次成功的数据。写冲突返回 409，前端自动刷新并提示重试。

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
npm run db:migrate
npx vercel dev                    # 同时运行前端与 /api（推荐）
```

- 只想看演示模式：`npm run dev`（普通 `vite dev` 不运行 Vercel Functions，云端页面会提示无法连接云端服务）。
- 检查：`npm run typecheck`、`npm run build`、`npm test`。

### 测试

- `npm test`：单元测试（不需要数据库）。`TEST_DATABASE_URL` 设置后会同时运行 API 集成测试。
- 集成测试会**清空并重建**测试库，因此只允许 `localhost`，或在显式设置 `ALLOW_TEST_DB_RESET=1` 时使用一次性的 Neon 测试分支。绝不要指向生产库。

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

### 回滚

- 前端/函数：Vercel → Deployments → 选择阶段一的部署 → **Instant Rollback**（或 Promote to Production）。阶段一版本不依赖数据库，可直接回滚。
- 数据库：本次迁移只新增表，回滚代码不需要回滚数据库；需要彻底清除时手动 `DROP TABLE trip_state, preferences, members, trips, schema_migrations`。

## 已知限制

- 限流是函数实例内存计数，不是多实例强一致限流；生产化应改用 Redis/KV。
- 身份只保存在浏览器 localStorage，换设备或清除数据后需要重新加入（同名会被拒绝，需由发起人移除旧身份）。
- 同步采用 10 秒轮询，不是实时推送。
- 目的地费用为确定性估算，不是实时报价；未收录城市使用通用画像并在方案中标注。
- 任务/付款只做状态记录，没有真实支付；“成员退出重算”目前只在演示模式中提供。
- 没有找回发起人身份、更换邀请码、审计日志等功能。
