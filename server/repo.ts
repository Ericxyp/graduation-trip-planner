/**
 * 数据访问层：所有 SQL 集中在这里，全部使用位置参数。
 * 时间统一以 ISO 字符串返回、计数统一转为 int，保证不同驱动返回一致的 JS 类型。
 *
 * 一致性约定：
 *  - 多步写入使用 db.transaction（同一事务，任一失败整体回滚）；
 *  - 需要“先检查版本再写”的操作写成单条带 CTE 的语句，保证业务写入、版本号与动态记录要么同时成功、要么都不发生；
 *  - trip_state.version 用于共享状态的乐观锁；trips.invite_version 用于邀请设置；expenses.version 用于单笔费用；
 *  - TripView.revision = trips.revision + trip_state.version，两者单调递增，任何写入都会推进其中之一。
 */
import { randomUUID } from 'node:crypto'
import { sanitizePayload, type ActivityType } from '../src/shared/activity.js'
import type { Preferences, Role, TripStatus } from '../src/shared/types.js'
import { stmt, type Db, type Stmt } from './db.js'

const ISO = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

export interface TripRow {
  id: string
  slug: string
  invite_code_hash: string
  name: string
  origin_city: string
  candidate_destinations: string[]
  date_start: string
  date_end: string
  member_limit: number
  invite_deadline: string | null
  status: TripStatus
  locked_plan_id: string | null
  created_at: string
  member_count: number
  organizer_name: string | null
  invite_paused: boolean
  invite_version: number
  revision: number
  recovery_code_hash: string | null
}

export interface MemberRow {
  id: string
  trip_id: string
  display_name: string
  role: Role
  color: string | null
  joined_at: string
  left_at: string | null
}

export interface MemberWithPrefs extends MemberRow {
  prefs: Preferences | null
}

export interface StateRow {
  selected_plan_id: string | null
  locked_plan_id: string | null
  tasks: Record<string, boolean>
  exited_members: string[]
  paid_members: string[]
  assignments: Record<string, string>
  version: number
  updated_at: string
}

export interface ExpenseRow {
  id: string
  title: string
  category: string
  amount_cents: number
  paid_by_member_id: string
  split_method: 'equal_all' | 'equal_selected' | 'custom'
  created_by_member_id: string
  version: number
  created_at: string
  shares: { member_id: string; share_cents: number }[]
}

export interface ActivityRow {
  id: number
  type: string
  payload: Record<string, unknown>
  created_at: string
}

const TRIP_COLUMNS = `t.id, t.slug, t.invite_code_hash, t.name, t.origin_city, t.candidate_destinations,
  t.date_start::text AS date_start, t.date_end::text AS date_end, t.member_limit,
  ${ISO('t.invite_deadline')} AS invite_deadline, t.status, t.locked_plan_id, ${ISO('t.created_at')} AS created_at,
  (SELECT count(*)::int FROM members m WHERE m.trip_id = t.id AND m.left_at IS NULL) AS member_count,
  (SELECT m.display_name FROM members m WHERE m.trip_id = t.id AND m.role = 'organizer' AND m.left_at IS NULL) AS organizer_name,
  t.invite_paused, t.invite_version, t.revision, t.recovery_code_hash`

const MEMBER_COLUMNS = `m.id, m.trip_id, m.display_name, m.role, m.color, ${ISO('m.joined_at')} AS joined_at, ${ISO('m.left_at')} AS left_at`

export const MEMBER_COLORS = ['#FF6B4A', '#3D97D6', '#E0A43A', '#5E9F7A', '#B86FB0', '#E07A6A', '#4E5A7A', '#2A9D8F']

export interface EventInput {
  type: ActivityType
  actorId: string | null
  payload: Record<string, unknown>
}

/** 动态记录语句：写入前按白名单过滤字段，杜绝把秘密写进 payload */
function eventStmt(tripId: string, ev: EventInput): Stmt {
  return stmt(
    `INSERT INTO activity_events (trip_id, actor_member_id, type, payload) VALUES ($1::uuid, $2::uuid, $3, $4::jsonb) RETURNING id`,
    [tripId, ev.actorId, ev.type, JSON.stringify(sanitizePayload(ev.type, ev.payload))],
  )
}

const bumpRevision = (tripId: string) => stmt(`UPDATE trips SET revision = revision + 1, updated_at = now() WHERE id = $1::uuid RETURNING revision`, [tripId])

export function createRepo(db: Db) {
  return {
    async createTrip(input: {
      slug: string
      inviteCodeHash: string
      organizerTokenHash: string
      recoveryCodeHash: string
      name: string
      originCity: string
      candidates: string[]
      dateStart: string
      dateEnd: string
      memberLimit: number
      inviteDeadline: string | null
      organizerName: string
    }): Promise<{ tripId: string; memberId: string }> {
      const tripId = randomUUID()
      const memberId = randomUUID()
      await db.transaction([
        stmt(
          `INSERT INTO trips (id, slug, invite_code_hash, organizer_token_hash, recovery_code_hash, name, origin_city, candidate_destinations,
             date_start, date_end, member_limit, invite_deadline, status, created_at, updated_at)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::date, $10::date, $11::int, $12::timestamptz, 'collecting', now(), now())
           RETURNING id`,
          [tripId, input.slug, input.inviteCodeHash, input.organizerTokenHash, input.recoveryCodeHash, input.name, input.originCity, JSON.stringify(input.candidates), input.dateStart, input.dateEnd, input.memberLimit, input.inviteDeadline],
        ),
        stmt(
          `INSERT INTO members (id, trip_id, display_name, member_token_hash, role, color, joined_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3, $4, 'organizer', $5, now(), now()) RETURNING id`,
          [memberId, tripId, input.organizerName, input.organizerTokenHash, MEMBER_COLORS[0]],
        ),
        stmt(
          `INSERT INTO trip_state (trip_id, tasks, exited_members, paid_members, assignments, version, updated_at)
           VALUES ($1::uuid, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, 0, now()) RETURNING trip_id`,
          [tripId],
        ),
        eventStmt(tripId, { type: 'trip_created', actorId: memberId, payload: { actor: input.organizerName, name: input.name } }),
      ])
      return { tripId, memberId }
    },

    async findTrip(slug: string): Promise<TripRow | null> {
      const rows = await db.query<TripRow & Record<string, unknown>>(`SELECT ${TRIP_COLUMNS} FROM trips t WHERE t.slug = $1`, [slug])
      return rows[0] ? { ...rows[0], invite_version: Number(rows[0].invite_version), revision: Number(rows[0].revision) } : null
    },

    /** 按 token 哈希查成员：既查阶段二的 members.member_token_hash，也查阶段三的多设备会话；包含已退出成员，由业务层判断 */
    async findMemberByToken(tripId: string, tokenHash: string): Promise<MemberRow | null> {
      const rows = await db.query<MemberRow & Record<string, unknown>>(
        `SELECT ${MEMBER_COLUMNS} FROM members m
         WHERE m.trip_id = $1::uuid
           AND (m.member_token_hash = $2
                OR EXISTS (SELECT 1 FROM member_sessions s WHERE s.member_id = m.id AND s.token_hash = $2 AND s.revoked_at IS NULL))
         LIMIT 1`,
        [tripId, tokenHash],
      )
      return rows[0] ?? null
    },

    /**
     * 加入旅行局：同一事务内先锁定 trips 行（FOR UPDATE），串行化并发加入，
     * 再在“活跃人数未满”时插入成员；活跃成员昵称冲突由部分唯一索引兜底。
     */
    async joinTrip(input: { tripId: string; displayName: string; tokenHash: string }): Promise<{ status: 'joined'; memberId: string } | { status: 'full' | 'name_taken' | 'name_taken_by_left' }> {
      const memberId = randomUUID()
      const [, inserted] = await db.transaction([
        stmt(`SELECT id FROM trips WHERE id = $1::uuid FOR UPDATE`, [input.tripId]),
        stmt(
          `INSERT INTO members (id, trip_id, display_name, member_token_hash, role, color, joined_at, updated_at)
           SELECT $1::uuid, $2::uuid, $3, $4, 'member',
                  (ARRAY['${MEMBER_COLORS.join("','")}'])[1 + ((SELECT count(*) FROM members WHERE trip_id = $2::uuid) % ${MEMBER_COLORS.length})::int],
                  now(), now()
           WHERE (SELECT count(*) FROM members WHERE trip_id = $2::uuid AND left_at IS NULL) < (SELECT member_limit FROM trips WHERE id = $2::uuid)
           -- 不指定冲突目标：同时兼容阶段二的全表唯一约束与阶段三的活跃成员部分唯一索引
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [memberId, input.tripId, input.displayName, input.tokenHash],
        ),
        stmt(
          `UPDATE trip_state SET version = version + 1, updated_at = now()
           WHERE trip_id = $1::uuid AND EXISTS (SELECT 1 FROM members WHERE id = $2::uuid)
           RETURNING version`,
          [input.tripId, memberId],
        ),
        stmt(
          `INSERT INTO activity_events (trip_id, actor_member_id, type, payload)
           SELECT $1::uuid, $2::uuid, 'member_joined', jsonb_build_object('actor', $3::text)
           WHERE EXISTS (SELECT 1 FROM members WHERE id = $2::uuid)
           RETURNING id`,
          [input.tripId, memberId, input.displayName],
        ),
      ])
      if (inserted.length) return { status: 'joined', memberId }
      const taken = await db.query<{ left: boolean }>(`SELECT left_at IS NOT NULL AS left FROM members WHERE trip_id = $1::uuid AND display_name = $2 ORDER BY left_at NULLS FIRST LIMIT 1`, [input.tripId, input.displayName])
      if (!taken.length) return { status: 'full' }
      // 部署后迁移（003）执行前，已退出成员仍占用昵称
      return { status: taken[0].left ? 'name_taken_by_left' : 'name_taken' }
    },

    /** 全部成员（含已退出，left_at 非空）。偏好只对活跃成员有意义，由业务层过滤 */
    async listMembers(tripId: string): Promise<MemberWithPrefs[]> {
      const rows = await db.query<Record<string, unknown>>(
        `SELECT ${MEMBER_COLUMNS},
                p.member_id IS NOT NULL AS has_prefs, p.dates, p.budget_id, p.destinations, p.pace, p.stay, p.musts, p.nos
         FROM members m LEFT JOIN preferences p ON p.member_id = m.id
         WHERE m.trip_id = $1::uuid
         ORDER BY m.joined_at, m.id`,
        [tripId],
      )
      return rows.map((r) => ({
        id: r.id as string,
        trip_id: r.trip_id as string,
        display_name: r.display_name as string,
        role: r.role as Role,
        color: (r.color as string | null) ?? null,
        joined_at: r.joined_at as string,
        left_at: (r.left_at as string | null) ?? null,
        prefs: r.has_prefs
          ? {
              dates: r.dates as string[],
              budgetId: r.budget_id as string,
              destinations: r.destinations as string[],
              pace: r.pace as Preferences['pace'],
              stay: r.stay as Preferences['stay'],
              musts: r.musts as string[],
              nos: r.nos as string[],
            }
          : null,
      }))
    },

    async upsertPreferences(tripId: string, member: { id: string; name: string }, p: Preferences, isUpdate: boolean): Promise<number> {
      const [, bumped] = await db.transaction([
        stmt(
          `INSERT INTO preferences (id, trip_id, member_id, dates, budget_id, destinations, pace, stay, musts, nos, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::jsonb, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb, now(), now())
           ON CONFLICT (member_id) DO UPDATE SET
             dates = EXCLUDED.dates, budget_id = EXCLUDED.budget_id, destinations = EXCLUDED.destinations,
             pace = EXCLUDED.pace, stay = EXCLUDED.stay, musts = EXCLUDED.musts, nos = EXCLUDED.nos, updated_at = now()
           RETURNING id`,
          [randomUUID(), tripId, member.id, JSON.stringify(p.dates), p.budgetId, JSON.stringify(p.destinations), p.pace, p.stay, JSON.stringify(p.musts), JSON.stringify(p.nos)],
        ),
        stmt(`UPDATE trip_state SET version = version + 1, updated_at = now() WHERE trip_id = $1::uuid RETURNING version`, [tripId]),
        // 动态只记录“谁提交/修改了偏好”，绝不记录偏好内容
        eventStmt(tripId, { type: isUpdate ? 'prefs_updated' : 'prefs_submitted', actorId: member.id, payload: { actor: member.name } }),
      ])
      return Number(bumped[0]?.version ?? 0)
    },

    async getState(tripId: string): Promise<StateRow> {
      const rows = await db.query<StateRow & Record<string, unknown>>(
        `SELECT selected_plan_id, locked_plan_id, tasks, exited_members, paid_members, assignments, version, ${ISO('updated_at')} AS updated_at
         FROM trip_state WHERE trip_id = $1::uuid`,
        [tripId],
      )
      if (!rows[0]) throw new Error('trip_state missing')
      return { ...rows[0], assignments: rows[0].assignments ?? {}, version: Number(rows[0].version) }
    },

    /** 乐观锁：版本一致时写入共享状态并记录动态（单条语句，原子），返回新版本号；不一致返回 null */
    async updateState(
      tripId: string,
      expectedVersion: number,
      patch: { tasks?: Record<string, boolean>; paidMembers?: string[] },
      ev: EventInput,
    ): Promise<number | null> {
      const rows = await db.query<{ version: number }>(
        `WITH s AS (
           UPDATE trip_state SET
             tasks = COALESCE($3::jsonb, tasks),
             paid_members = COALESCE($4::jsonb, paid_members),
             version = version + 1, updated_at = now()
           WHERE trip_id = $1::uuid AND version = $2::int
           RETURNING version
         ), e AS (
           INSERT INTO activity_events (trip_id, actor_member_id, type, payload)
           SELECT $1::uuid, $5::uuid, $6, $7::jsonb FROM s RETURNING id
         )
         SELECT version FROM s`,
        [
          tripId,
          expectedVersion,
          patch.tasks ? JSON.stringify(patch.tasks) : null,
          patch.paidMembers ? JSON.stringify(patch.paidMembers) : null,
          ev.actorId,
          ev.type,
          JSON.stringify(sanitizePayload(ev.type, ev.payload)),
        ],
      )
      return rows[0] ? Number(rows[0].version) : null
    },

    /** 锁定/解锁：单条语句同时更新 trip_state（含任务负责人固化）、trips 与动态，版本不一致则什么都不改 */
    async setLock(tripId: string, expectedVersion: number, planId: string | null, assignments: Record<string, string>, ev: EventInput): Promise<number | null> {
      const rows = await db.query<{ version: number }>(
        `WITH s AS (
           UPDATE trip_state SET locked_plan_id = $3, selected_plan_id = COALESCE($3, selected_plan_id),
                  assignments = $4::jsonb, version = version + 1, updated_at = now()
           WHERE trip_id = $1::uuid AND version = $2::int
           RETURNING version, locked_plan_id
         ), t AS (
           UPDATE trips t SET locked_plan_id = s.locked_plan_id,
                  status = CASE WHEN s.locked_plan_id IS NULL THEN 'collecting' ELSE 'locked' END,
                  updated_at = now()
           FROM s WHERE t.id = $1::uuid
           RETURNING s.version
         ), e AS (
           INSERT INTO activity_events (trip_id, actor_member_id, type, payload)
           SELECT $1::uuid, $5::uuid, $6, $7::jsonb FROM s RETURNING id
         )
         SELECT version FROM t`,
        [tripId, expectedVersion, planId, JSON.stringify(assignments), ev.actorId, ev.type, JSON.stringify(sanitizePayload(ev.type, ev.payload))],
      )
      return rows[0] ? Number(rows[0].version) : null
    },

    /**
     * 成员退出 / 被移除（软删除）。同一事务：
     *  1) 锁定 trip_state 行（串行化并发退出）；
     *  2) 仅当 state.version 仍为 expectedVersion 时标记 left_at 并吊销该成员全部会话；
     *  3) 写入重新分配后的任务负责人、推进版本；
     *  4) 写入动态。
     * 若期间有其他写入（版本变化），2–4 都不会生效，返回 'conflict' 由业务层重算后重试。
     */
    async leaveMember(input: {
      tripId: string
      memberId: string
      expectedVersion: number
      assignments: Record<string, string>
      paidMembers: string[]
      event: EventInput
    }): Promise<'left' | 'already_left' | 'conflict'> {
      const { tripId, memberId, expectedVersion: v } = input
      const res = await db.transaction([
        // 先锁 trip_state 行：并发退出/写入在此排队；之后的语句拿到的是最新已提交版本
        stmt(`SELECT version FROM trip_state WHERE trip_id = $1::uuid FOR UPDATE`, [tripId]),
        stmt(
          `WITH m AS (
             UPDATE members SET left_at = now(), updated_at = now()
             WHERE id = $2::uuid AND trip_id = $1::uuid AND left_at IS NULL AND role = 'member'
               AND (SELECT version FROM trip_state WHERE trip_id = $1::uuid) = $3::int
             RETURNING id
           ), s AS (
             UPDATE trip_state SET assignments = $4::jsonb, paid_members = $5::jsonb, version = version + 1, updated_at = now()
             WHERE trip_id = $1::uuid AND version = $3::int AND EXISTS (SELECT 1 FROM m)
             RETURNING version
           ), r AS (
             UPDATE member_sessions SET revoked_at = now() WHERE member_id IN (SELECT id FROM m) AND revoked_at IS NULL RETURNING id
           ), e AS (
             INSERT INTO activity_events (trip_id, actor_member_id, type, payload)
             SELECT $1::uuid, $6::uuid, $7, $8::jsonb FROM s RETURNING id
           )
           SELECT id FROM m`,
          [tripId, memberId, v, JSON.stringify(input.assignments), JSON.stringify(input.paidMembers), input.event.actorId, input.event.type, JSON.stringify(sanitizePayload(input.event.type, input.event.payload))],
        ),
      ])
      if (res[1].length) return 'left'
      const m = await db.query<{ left: boolean }>(`SELECT left_at IS NOT NULL AS left FROM members WHERE id = $1::uuid`, [memberId])
      return m[0]?.left ? 'already_left' : 'conflict'
    },

    /** 转让发起人：先降级旧发起人、再升级新发起人（避免触发“每局唯一发起人”索引），并清除旧恢复码 */
    async transferOrganizer(tripId: string, from: { id: string; name: string }, to: { id: string; name: string }): Promise<boolean> {
      const res = await db.transaction([
        stmt(`SELECT id FROM trips WHERE id = $1::uuid FOR UPDATE`, [tripId]),
        stmt(
          `UPDATE members SET role = 'member', updated_at = now()
           WHERE id = $2::uuid AND trip_id = $1::uuid AND role = 'organizer'
             AND EXISTS (SELECT 1 FROM members WHERE id = $3::uuid AND trip_id = $1::uuid AND left_at IS NULL AND role = 'member')
           RETURNING id`,
          [tripId, from.id, to.id],
        ),
        stmt(
          `UPDATE members SET role = 'organizer', updated_at = now()
           WHERE id = $2::uuid AND trip_id = $1::uuid AND left_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM members WHERE trip_id = $1::uuid AND role = 'organizer')
           RETURNING id`,
          [tripId, to.id],
        ),
        stmt(`UPDATE trips SET recovery_code_hash = NULL, revision = revision + 1, updated_at = now() WHERE id = $1::uuid AND EXISTS (SELECT 1 FROM members WHERE id = $2::uuid AND role = 'organizer') RETURNING id`, [tripId, to.id]),
        stmt(`UPDATE trip_state SET version = version + 1, updated_at = now() WHERE trip_id = $1::uuid AND EXISTS (SELECT 1 FROM members WHERE id = $2::uuid AND role = 'organizer') RETURNING version`, [tripId, to.id]),
        stmt(
          `INSERT INTO activity_events (trip_id, actor_member_id, type, payload)
           SELECT $1::uuid, $2::uuid, 'organizer_transferred', jsonb_build_object('actor', $3::text, 'target', $4::text)
           WHERE EXISTS (SELECT 1 FROM members WHERE id = $5::uuid AND role = 'organizer') RETURNING id`,
          [tripId, from.id, from.name, to.name, to.id],
        ),
      ])
      return res[2].length > 0
    },

    async archiveTrip(tripId: string, actor: { id: string; name: string }): Promise<void> {
      await db.transaction([
        stmt(`UPDATE trips SET status = 'archived', revision = revision + 1, updated_at = now() WHERE id = $1::uuid RETURNING id`, [tripId]),
        eventStmt(tripId, { type: 'trip_archived', actorId: actor.id, payload: { actor: actor.name } }),
      ])
    },

    /** 邀请设置：以 invite_version 做乐观锁；undefined 表示该字段不变 */
    async updateInvite(
      tripId: string,
      expectedInviteVersion: number,
      patch: { codeHash?: string; paused?: boolean; deadline?: string | null },
      ev: EventInput,
    ): Promise<number | null> {
      const rows = await db.query<{ invite_version: number }>(
        `WITH t AS (
           UPDATE trips SET
             invite_code_hash = COALESCE($3, invite_code_hash),
             invite_paused = COALESCE($4::boolean, invite_paused),
             invite_deadline = CASE WHEN $5::boolean THEN $6::timestamptz ELSE invite_deadline END,
             invite_version = invite_version + 1, revision = revision + 1, updated_at = now()
           WHERE id = $1::uuid AND invite_version = $2::int
           RETURNING invite_version
         ), e AS (
           INSERT INTO activity_events (trip_id, actor_member_id, type, payload)
           SELECT $1::uuid, $7::uuid, $8, $9::jsonb FROM t RETURNING id
         )
         SELECT invite_version FROM t`,
        [
          tripId,
          expectedInviteVersion,
          patch.codeHash ?? null,
          patch.paused === undefined ? null : patch.paused,
          patch.deadline !== undefined,
          patch.deadline ?? null,
          ev.actorId,
          ev.type,
          JSON.stringify(sanitizePayload(ev.type, ev.payload)),
        ],
      )
      return rows[0] ? Number(rows[0].invite_version) : null
    },

    async setRecoveryHash(tripId: string, hash: string, ev: EventInput): Promise<void> {
      await db.transaction([
        stmt(`UPDATE trips SET recovery_code_hash = $2, revision = revision + 1, updated_at = now() WHERE id = $1::uuid RETURNING id`, [tripId, hash]),
        eventStmt(tripId, ev),
      ])
    },

    async getRecoveryTarget(tripId: string): Promise<{ hash: string | null; organizer: MemberRow | null }> {
      const t = await db.query<{ recovery_code_hash: string | null }>(`SELECT recovery_code_hash FROM trips WHERE id = $1::uuid`, [tripId])
      const o = await db.query<MemberRow & Record<string, unknown>>(`SELECT ${MEMBER_COLUMNS} FROM members m WHERE m.trip_id = $1::uuid AND m.role = 'organizer' AND m.left_at IS NULL`, [tripId])
      return { hash: t[0]?.recovery_code_hash ?? null, organizer: o[0] ?? null }
    },

    /** 新增一个发起人会话（新设备），旧 token 与旧会话保持有效 */
    async createSession(tripId: string, memberId: string, tokenHash: string, ev: EventInput): Promise<void> {
      await db.transaction([
        stmt(`INSERT INTO member_sessions (id, trip_id, member_id, token_hash, kind) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'recovery') RETURNING id`, [randomUUID(), tripId, memberId, tokenHash]),
        bumpRevision(tripId),
        eventStmt(tripId, ev),
      ])
    },

    /* ---------------- 费用台账 ---------------- */

    async listExpenses(tripId: string): Promise<ExpenseRow[]> {
      const rows = await db.query<Record<string, unknown>>(
        `SELECT e.id, e.title, e.category, e.amount_cents, e.paid_by_member_id, e.split_method, e.created_by_member_id, e.version,
                ${ISO('e.created_at')} AS created_at,
                COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id', s.member_id, 'share_cents', s.share_cents) ORDER BY s.member_id)
                          FROM expense_shares s WHERE s.expense_id = e.id), '[]'::jsonb) AS shares
         FROM expenses e WHERE e.trip_id = $1::uuid AND e.deleted_at IS NULL
         ORDER BY e.created_at DESC, e.id
         LIMIT 500`,
        [tripId],
      )
      return rows.map((r) => ({
        id: r.id as string,
        title: r.title as string,
        category: r.category as string,
        amount_cents: Number(r.amount_cents),
        paid_by_member_id: r.paid_by_member_id as string,
        split_method: r.split_method as ExpenseRow['split_method'],
        created_by_member_id: r.created_by_member_id as string,
        version: Number(r.version),
        created_at: r.created_at as string,
        shares: (r.shares as { member_id: string; share_cents: number }[]).map((s) => ({ member_id: s.member_id, share_cents: Number(s.share_cents) })),
      }))
    },

    async findExpense(tripId: string, expenseId: string): Promise<ExpenseRow | null> {
      const all = await db.query<{ id: string }>(`SELECT id FROM expenses WHERE id = $1::uuid AND trip_id = $2::uuid AND deleted_at IS NULL`, [expenseId, tripId])
      if (!all.length) return null
      return (await this.listExpenses(tripId)).find((e) => e.id === expenseId) ?? null
    },

    /** 新增费用：费用、分摊明细、动态与修订号在同一事务中写入 */
    async insertExpense(tripId: string, e: { title: string; category: string; amountCents: number; paidBy: string; splitMethod: string; createdBy: string; shares: Map<string, number> }, ev: EventInput): Promise<string> {
      const id = randomUUID()
      const shares = [...e.shares].map(([member_id, share_cents]) => ({ member_id, share_cents }))
      await db.transaction([
        stmt(
          `INSERT INTO expenses (id, trip_id, title, category, amount_cents, paid_by_member_id, split_method, created_by_member_id, version, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5::int, $6::uuid, $7, $8::uuid, 0, now(), now()) RETURNING id`,
          [id, tripId, e.title, e.category, e.amountCents, e.paidBy, e.splitMethod, e.createdBy],
        ),
        stmt(
          `INSERT INTO expense_shares (expense_id, member_id, share_cents)
           SELECT $1::uuid, x.member_id, x.share_cents FROM jsonb_to_recordset($2::jsonb) AS x(member_id uuid, share_cents int)
           RETURNING member_id`,
          [id, JSON.stringify(shares)],
        ),
        bumpRevision(tripId),
        eventStmt(tripId, ev),
      ])
      return id
    },

    /** 修改费用：单条 CTE 语句，版本一致才更新主记录、分摊明细、修订号与动态 */
    async updateExpense(tripId: string, expenseId: string, expectedVersion: number, e: { title: string; category: string; amountCents: number; paidBy: string; splitMethod: string; shares: Map<string, number> }, ev: EventInput): Promise<boolean> {
      const shares = [...e.shares].map(([member_id, share_cents]) => ({ member_id, share_cents }))
      const rows = await db.query<{ id: string }>(
        `WITH u AS (
           UPDATE expenses SET title = $4, category = $5, amount_cents = $6::int, paid_by_member_id = $7::uuid, split_method = $8,
                  version = version + 1, updated_at = now()
           WHERE id = $2::uuid AND trip_id = $1::uuid AND version = $3::int AND deleted_at IS NULL
           RETURNING id
         ), x AS (
           SELECT * FROM jsonb_to_recordset($9::jsonb) AS x(member_id uuid, share_cents int)
         ), i AS (
           INSERT INTO expense_shares (expense_id, member_id, share_cents)
           SELECT u.id, x.member_id, x.share_cents FROM u, x
           ON CONFLICT (expense_id, member_id) DO UPDATE SET share_cents = EXCLUDED.share_cents
           RETURNING member_id
         ), d AS (
           DELETE FROM expense_shares s USING u
           WHERE s.expense_id = u.id AND s.member_id NOT IN (SELECT member_id FROM x)
           RETURNING s.member_id
         ), r AS (
           UPDATE trips SET revision = revision + 1, updated_at = now() WHERE id = $1::uuid AND EXISTS (SELECT 1 FROM u) RETURNING id
         ), ev AS (
           INSERT INTO activity_events (trip_id, actor_member_id, type, payload)
           SELECT $1::uuid, $10::uuid, $11, $12::jsonb FROM u RETURNING id
         )
         SELECT id FROM u`,
        [tripId, expenseId, expectedVersion, e.title, e.category, e.amountCents, e.paidBy, e.splitMethod, JSON.stringify(shares), ev.actorId, ev.type, JSON.stringify(sanitizePayload(ev.type, ev.payload))],
      )
      return rows.length > 0
    },

    /** 软删除费用：保留记录与分摊明细，只设置 deleted_at */
    async deleteExpense(tripId: string, expenseId: string, expectedVersion: number, ev: EventInput): Promise<boolean> {
      const rows = await db.query<{ id: string }>(
        `WITH u AS (
           UPDATE expenses SET deleted_at = now(), version = version + 1, updated_at = now()
           WHERE id = $2::uuid AND trip_id = $1::uuid AND version = $3::int AND deleted_at IS NULL
           RETURNING id
         ), r AS (
           UPDATE trips SET revision = revision + 1, updated_at = now() WHERE id = $1::uuid AND EXISTS (SELECT 1 FROM u) RETURNING id
         ), ev AS (
           INSERT INTO activity_events (trip_id, actor_member_id, type, payload)
           SELECT $1::uuid, $4::uuid, $5, $6::jsonb FROM u RETURNING id
         )
         SELECT id FROM u`,
        [tripId, expenseId, expectedVersion, ev.actorId, ev.type, JSON.stringify(sanitizePayload(ev.type, ev.payload))],
      )
      return rows.length > 0
    },

    async listActivity(tripId: string, limit = 20): Promise<ActivityRow[]> {
      const rows = await db.query<Record<string, unknown>>(
        `SELECT id, type, payload, ${ISO('created_at')} AS created_at FROM activity_events WHERE trip_id = $1::uuid ORDER BY id DESC LIMIT $2::int`,
        [tripId, limit],
      )
      return rows.map((r) => ({ id: Number(r.id), type: r.type as string, payload: (r.payload as Record<string, unknown>) ?? {}, created_at: r.created_at as string }))
    },

    async ping(): Promise<boolean> {
      const rows = await db.query<{ ok: number }>(`SELECT 1 AS ok`)
      return rows[0]?.ok === 1
    },
  }
}

export type Repo = ReturnType<typeof createRepo>
