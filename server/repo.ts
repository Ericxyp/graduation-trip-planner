/**
 * 数据访问层：所有 SQL 集中在这里，全部使用位置参数。
 * 时间统一以 ISO 字符串返回、计数统一转为 int，保证不同驱动返回一致的 JS 类型。
 */
import { randomUUID } from 'node:crypto'
import type { Preferences, Role, TripStatus } from '../src/shared/types.js'
import { stmt, type Db } from './db.js'

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
}

export interface MemberRow {
  id: string
  trip_id: string
  display_name: string
  role: Role
  color: string | null
  joined_at: string
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
  version: number
  updated_at: string
}

const TRIP_COLUMNS = `t.id, t.slug, t.invite_code_hash, t.name, t.origin_city, t.candidate_destinations,
  t.date_start::text AS date_start, t.date_end::text AS date_end, t.member_limit,
  ${ISO('t.invite_deadline')} AS invite_deadline, t.status, t.locked_plan_id, ${ISO('t.created_at')} AS created_at,
  (SELECT count(*)::int FROM members m WHERE m.trip_id = t.id) AS member_count,
  (SELECT m.display_name FROM members m WHERE m.trip_id = t.id AND m.role = 'organizer') AS organizer_name`

const MEMBER_COLUMNS = `m.id, m.trip_id, m.display_name, m.role, m.color, ${ISO('m.joined_at')} AS joined_at`

export const MEMBER_COLORS = ['#FF6B4A', '#3D97D6', '#E0A43A', '#5E9F7A', '#B86FB0', '#E07A6A', '#4E5A7A', '#2A9D8F']

export function createRepo(db: Db) {
  return {
    async createTrip(input: {
      slug: string
      inviteCodeHash: string
      organizerTokenHash: string
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
          `INSERT INTO trips (id, slug, invite_code_hash, organizer_token_hash, name, origin_city, candidate_destinations,
             date_start, date_end, member_limit, invite_deadline, status, created_at, updated_at)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8::date, $9::date, $10::int, $11::timestamptz, 'collecting', now(), now())
           RETURNING id`,
          [tripId, input.slug, input.inviteCodeHash, input.organizerTokenHash, input.name, input.originCity, JSON.stringify(input.candidates), input.dateStart, input.dateEnd, input.memberLimit, input.inviteDeadline],
        ),
        stmt(
          `INSERT INTO members (id, trip_id, display_name, member_token_hash, role, color, joined_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3, $4, 'organizer', $5, now(), now()) RETURNING id`,
          [memberId, tripId, input.organizerName, input.organizerTokenHash, MEMBER_COLORS[0]],
        ),
        stmt(
          `INSERT INTO trip_state (trip_id, tasks, exited_members, paid_members, version, updated_at)
           VALUES ($1::uuid, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, 0, now()) RETURNING trip_id`,
          [tripId],
        ),
      ])
      return { tripId, memberId }
    },

    async findTrip(slug: string): Promise<TripRow | null> {
      const rows = await db.query<TripRow & Record<string, unknown>>(`SELECT ${TRIP_COLUMNS} FROM trips t WHERE t.slug = $1`, [slug])
      return rows[0] ?? null
    },

    async findMemberByToken(tripId: string, tokenHash: string): Promise<MemberRow | null> {
      const rows = await db.query<MemberRow & Record<string, unknown>>(
        `SELECT ${MEMBER_COLUMNS} FROM members m WHERE m.trip_id = $1::uuid AND m.member_token_hash = $2`,
        [tripId, tokenHash],
      )
      return rows[0] ?? null
    },

    /**
     * 加入旅行局：同一事务内先锁定 trips 行（FOR UPDATE），串行化并发加入，
     * 再在人数未满时插入成员；昵称冲突由唯一约束兜底。
     */
    async joinTrip(input: { tripId: string; displayName: string; tokenHash: string }): Promise<{ status: 'joined'; memberId: string } | { status: 'full' | 'name_taken' }> {
      const memberId = randomUUID()
      const [, inserted] = await db.transaction([
        stmt(`SELECT id FROM trips WHERE id = $1::uuid FOR UPDATE`, [input.tripId]),
        stmt(
          `INSERT INTO members (id, trip_id, display_name, member_token_hash, role, color, joined_at, updated_at)
           SELECT $1::uuid, $2::uuid, $3, $4, 'member',
                  (ARRAY['${MEMBER_COLORS.join("','")}'])[1 + ((SELECT count(*) FROM members WHERE trip_id = $2::uuid) % ${MEMBER_COLORS.length})::int],
                  now(), now()
           WHERE (SELECT count(*) FROM members WHERE trip_id = $2::uuid) < (SELECT member_limit FROM trips WHERE id = $2::uuid)
           ON CONFLICT ON CONSTRAINT members_trip_name_unique DO NOTHING
           RETURNING id`,
          [memberId, input.tripId, input.displayName, input.tokenHash],
        ),
        stmt(
          `UPDATE trip_state SET version = version + 1, updated_at = now()
           WHERE trip_id = $1::uuid AND EXISTS (SELECT 1 FROM members WHERE id = $2::uuid)
           RETURNING version`,
          [input.tripId, memberId],
        ),
      ])
      if (inserted.length) return { status: 'joined', memberId }
      const taken = await db.query(`SELECT 1 AS x FROM members WHERE trip_id = $1::uuid AND display_name = $2`, [input.tripId, input.displayName])
      return { status: taken.length ? 'name_taken' : 'full' }
    },

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

    async upsertPreferences(tripId: string, memberId: string, p: Preferences): Promise<number> {
      const [, bumped] = await db.transaction([
        stmt(
          `INSERT INTO preferences (id, trip_id, member_id, dates, budget_id, destinations, pace, stay, musts, nos, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::jsonb, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb, now(), now())
           ON CONFLICT (member_id) DO UPDATE SET
             dates = EXCLUDED.dates, budget_id = EXCLUDED.budget_id, destinations = EXCLUDED.destinations,
             pace = EXCLUDED.pace, stay = EXCLUDED.stay, musts = EXCLUDED.musts, nos = EXCLUDED.nos, updated_at = now()
           RETURNING id`,
          [randomUUID(), tripId, memberId, JSON.stringify(p.dates), p.budgetId, JSON.stringify(p.destinations), p.pace, p.stay, JSON.stringify(p.musts), JSON.stringify(p.nos)],
        ),
        stmt(`UPDATE trip_state SET version = version + 1, updated_at = now() WHERE trip_id = $1::uuid RETURNING version`, [tripId]),
      ])
      return Number(bumped[0]?.version ?? 0)
    },

    async getState(tripId: string): Promise<StateRow> {
      const rows = await db.query<StateRow & Record<string, unknown>>(
        `SELECT selected_plan_id, locked_plan_id, tasks, exited_members, paid_members, version, ${ISO('updated_at')} AS updated_at
         FROM trip_state WHERE trip_id = $1::uuid`,
        [tripId],
      )
      if (!rows[0]) throw new Error('trip_state missing')
      return { ...rows[0], version: Number(rows[0].version) }
    },

    /** 乐观锁：只有 version 与客户端期望一致时才写入，返回新版本号；不一致返回 null */
    async updateState(tripId: string, expectedVersion: number, patch: { tasks?: Record<string, boolean>; paidMembers?: string[]; exitedMembers?: string[] }): Promise<number | null> {
      const rows = await db.query<{ version: number }>(
        `UPDATE trip_state SET
           tasks = COALESCE($3::jsonb, tasks),
           paid_members = COALESCE($4::jsonb, paid_members),
           exited_members = COALESCE($5::jsonb, exited_members),
           version = version + 1, updated_at = now()
         WHERE trip_id = $1::uuid AND version = $2::int
         RETURNING version`,
        [tripId, expectedVersion, patch.tasks ? JSON.stringify(patch.tasks) : null, patch.paidMembers ? JSON.stringify(patch.paidMembers) : null, patch.exitedMembers ? JSON.stringify(patch.exitedMembers) : null],
      )
      return rows[0] ? Number(rows[0].version) : null
    },

    /** 锁定/解锁：单条语句同时更新 trip_state 与 trips，版本不一致则什么都不改 */
    async setLock(tripId: string, expectedVersion: number, planId: string | null): Promise<number | null> {
      const rows = await db.query<{ version: number }>(
        `WITH s AS (
           UPDATE trip_state SET locked_plan_id = $3, selected_plan_id = COALESCE($3, selected_plan_id),
                  version = version + 1, updated_at = now()
           WHERE trip_id = $1::uuid AND version = $2::int
           RETURNING version, locked_plan_id
         )
         UPDATE trips t SET locked_plan_id = s.locked_plan_id,
                status = CASE WHEN s.locked_plan_id IS NULL THEN 'collecting' ELSE 'locked' END,
                updated_at = now()
         FROM s WHERE t.id = $1::uuid
         RETURNING s.version`,
        [tripId, expectedVersion, planId],
      )
      return rows[0] ? Number(rows[0].version) : null
    },

    async removeMember(tripId: string, memberId: string): Promise<boolean> {
      const [deleted] = await db.transaction([
        stmt(`DELETE FROM members WHERE trip_id = $1::uuid AND id = $2::uuid AND role = 'member' RETURNING id`, [tripId, memberId]),
        stmt(`UPDATE trip_state SET version = version + 1, updated_at = now() WHERE trip_id = $1::uuid RETURNING version`, [tripId]),
      ])
      return deleted.length > 0
    },

    async ping(): Promise<boolean> {
      const rows = await db.query<{ ok: number }>(`SELECT 1 AS ok`)
      return rows[0]?.ok === 1
    },
  }
}

export type Repo = ReturnType<typeof createRepo>
