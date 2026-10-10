/**
 * 业务层：身份校验、权限判断与 DTO 组装。
 * 权限只依据服务端查到的成员记录（role 字段），从不信任客户端传入的角色或成员 ID。
 */
import { computeConsensus, computePlanById, type ConsensusMember } from '../src/shared/consensus.js'
import type { CreateTripBody, JoinTripBody, LockBody, PreferencesBody, StatePatchBody } from '../src/shared/schemas.js'
import type { CreateTripResult, JoinTripResult, MemberSummary, PublicTrip, TripView } from '../src/shared/types.js'
import { ApiError } from './errors.js'
import type { MemberRow, MemberWithPrefs, Repo, TripRow } from './repo.js'
import { hashSecret, isPlausibleToken, newInviteCode, newSlug, newToken, normalizeInviteCode, verifySecret } from './security.js'

export interface ServiceDeps {
  repo: Repo
  pepper: string
  appOrigin: string
  now?: () => Date
}

export function toPublicTrip(t: TripRow, now: Date): PublicTrip {
  return {
    slug: t.slug,
    name: t.name,
    organizerName: t.organizer_name ?? '',
    originCity: t.origin_city,
    candidateDestinations: t.candidate_destinations,
    dateStart: t.date_start,
    dateEnd: t.date_end,
    memberLimit: t.member_limit,
    memberCount: t.member_count,
    inviteDeadline: t.invite_deadline,
    inviteExpired: !!t.invite_deadline && new Date(t.invite_deadline).getTime() < now.getTime(),
    isFull: t.member_count >= t.member_limit,
    status: t.status,
    createdAt: t.created_at,
  }
}

/** 公开的成员摘要：只有昵称、角色、颜色和“是否已填写”，没有任何偏好内容 */
export function toMemberSummary(m: MemberWithPrefs): MemberSummary {
  return { id: m.id, displayName: m.display_name, role: m.role, color: m.color ?? '#7A8094', hasPreferences: !!m.prefs, joinedAt: m.joined_at }
}

function toConsensusMembers(ms: MemberWithPrefs[]): ConsensusMember[] {
  return ms.map((m) => ({ id: m.id, displayName: m.display_name, role: m.role, joinedAt: m.joined_at, prefs: m.prefs }))
}

export function createService(deps: ServiceDeps) {
  const { repo, pepper } = deps
  const now = deps.now ?? (() => new Date())

  async function loadTrip(slug: string): Promise<TripRow> {
    if (!/^[a-z0-9]{6,32}$/.test(slug)) throw new ApiError('TRIP_NOT_FOUND', '旅行局不存在或已被删除')
    const trip = await repo.findTrip(slug)
    if (!trip) throw new ApiError('TRIP_NOT_FOUND', '旅行局不存在或已被删除')
    return trip
  }

  async function authenticate(trip: TripRow, token: string | null): Promise<MemberRow> {
    if (!token || !isPlausibleToken(token)) throw new ApiError('UNAUTHORIZED', '请先加入旅行局')
    const member = await repo.findMemberByToken(trip.id, hashSecret(token, pepper, 'token'))
    if (!member) throw new ApiError('UNAUTHORIZED', '身份已失效，请重新加入旅行局')
    return member
  }

  function requireOrganizer(m: MemberRow) {
    if (m.role !== 'organizer') throw new ApiError('FORBIDDEN', '只有发起人可以执行此操作')
  }

  async function buildView(trip: TripRow, me: MemberRow): Promise<TripView> {
    const [members, state] = await Promise.all([repo.listMembers(trip.id), repo.getState(trip.id)])
    const cm = toConsensusMembers(members)
    const consensus = computeConsensus({ candidateDestinations: trip.candidate_destinations, dateStart: trip.date_start, dateEnd: trip.date_end }, cm, me.id, now())
    const lockedPlan = state.locked_plan_id
      ? computePlanById({ candidateDestinations: trip.candidate_destinations, dateStart: trip.date_start, dateEnd: trip.date_end }, cm, state.locked_plan_id, me.id,
          consensus.plans.find((p) => p.id === state.locked_plan_id)?.kind ?? 'consensus')
      : null
    const mine = members.find((m) => m.id === me.id)
    const memberIds = new Set(members.map((m) => m.id))
    return {
      trip: toPublicTrip({ ...trip, member_count: members.length }, now()),
      me: { memberId: me.id, displayName: me.display_name, role: me.role, preferences: mine?.prefs ?? null },
      members: members.map(toMemberSummary),
      filledCount: members.filter((m) => m.prefs).length,
      consensus,
      lockedPlan,
      state: {
        selectedPlanId: state.selected_plan_id,
        lockedPlanId: state.locked_plan_id,
        tasks: state.tasks ?? {},
        paidMembers: (state.paid_members ?? []).filter((id) => memberIds.has(id)),
        exitedMembers: (state.exited_members ?? []).filter((id) => memberIds.has(id)),
        version: state.version,
        updatedAt: state.updated_at,
      },
      revision: state.version,
      serverTime: now().toISOString(),
    }
  }

  return {
    async createTrip(body: CreateTripBody): Promise<CreateTripResult> {
      const code = newInviteCode()
      const token = newToken()
      let created: { tripId: string; memberId: string } | null = null
      let slug = ''
      for (let attempt = 0; attempt < 3 && !created; attempt++) {
        slug = newSlug()
        try {
          created = await repo.createTrip({
            slug,
            inviteCodeHash: hashSecret(code, pepper, 'invite'),
            organizerTokenHash: hashSecret(token, pepper, 'token'),
            name: body.name,
            originCity: body.originCity,
            candidates: body.candidateDestinations,
            dateStart: body.dateStart,
            dateEnd: body.dateEnd,
            memberLimit: body.memberLimit,
            inviteDeadline: body.inviteDeadline ?? null,
            organizerName: body.organizerName,
          })
        } catch (e) {
          if ((e as { code?: string }).code !== '23505' || attempt === 2) throw e // slug 撞车时重试
        }
      }
      const trip = await loadTrip(slug)
      return {
        trip: toPublicTrip(trip, now()),
        identity: { memberId: created!.memberId, memberToken: token, role: 'organizer' },
        // 邀请码放在 URL fragment（#）里：浏览器不会把 fragment 发给服务器，访问日志里不会出现明文邀请码
        invite: { code, url: `${deps.appOrigin}/trip/${slug}/join#code=${code}` },
      }
    },

    async getPublic(slug: string): Promise<PublicTrip> {
      return toPublicTrip(await loadTrip(slug), now())
    },

    async join(slug: string, body: JoinTripBody): Promise<JoinTripResult> {
      const trip = await loadTrip(slug)
      if (!verifySecret(normalizeInviteCode(body.inviteCode), trip.invite_code_hash, pepper, 'invite')) throw new ApiError('INVALID_INVITE_CODE', '邀请码不正确，请向发起人确认')
      const pub = toPublicTrip(trip, now())
      if (pub.inviteExpired) throw new ApiError('INVITE_EXPIRED', '邀请已过期，请联系发起人')
      if (trip.status === 'archived') throw new ApiError('INVITE_EXPIRED', '旅行局已归档，无法加入')
      const token = newToken()
      const r = await repo.joinTrip({ tripId: trip.id, displayName: body.displayName, tokenHash: hashSecret(token, pepper, 'token') })
      if (r.status !== 'joined') {
        throw r.status === 'name_taken' ? new ApiError('DISPLAY_NAME_TAKEN', '这个昵称已被使用，换一个试试') : new ApiError('MEMBER_LIMIT_REACHED', '旅行局人数已满')
      }
      const fresh = await loadTrip(slug)
      return { trip: toPublicTrip(fresh, now()), identity: { memberId: r.memberId, memberToken: token, role: 'member' } }
    },

    async getTrip(slug: string, token: string | null): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      return buildView(trip, me)
    },

    async getConsensus(slug: string, token: string | null) {
      const view = await this.getTrip(slug, token)
      return { consensus: view.consensus, lockedPlan: view.lockedPlan, revision: view.revision }
    },

    /** 成员只能写自己的偏好：member_id 来自 token 对应的记录，不接受请求体里的任何 ID */
    async putMyPreferences(slug: string, token: string | null, body: PreferencesBody): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      const allowedDates = new Set<string>()
      for (let d = trip.date_start; d <= trip.date_end; ) {
        allowedDates.add(d)
        const n = new Date(`${d}T00:00:00Z`)
        n.setUTCDate(n.getUTCDate() + 1)
        d = n.toISOString().slice(0, 10)
      }
      if (body.dates.some((d) => !allowedDates.has(d))) throw new ApiError('INVALID_INPUT', '可出发日期需在旅行局日期范围内')
      if (body.destinations.some((d) => !trip.candidate_destinations.includes(d))) throw new ApiError('INVALID_INPUT', '目的地需从候选目的地中选择')
      const dedupe = <T,>(xs: T[]) => [...new Set(xs)]
      await repo.upsertPreferences(trip.id, me.id, {
        dates: dedupe(body.dates).sort(),
        budgetId: body.budgetId,
        destinations: dedupe(body.destinations),
        pace: body.pace,
        stay: body.stay,
        musts: dedupe(body.musts),
        nos: dedupe(body.nos),
      })
      return buildView(trip, me)
    },

    async patchState(slug: string, token: string | null, body: StatePatchBody): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      const state = await repo.getState(trip.id)
      if (state.version !== body.expectedVersion) throw new ApiError('VERSION_CONFLICT', '数据已被其他成员更新，请刷新后重试')
      let next: number | null
      if (body.op === 'task') {
        if (!state.locked_plan_id) throw new ApiError('FORBIDDEN', '方案锁定后才能更新任务')
        const members = toConsensusMembers(await repo.listMembers(trip.id))
        const plan = computePlanById({ candidateDestinations: trip.candidate_destinations, dateStart: trip.date_start, dateEnd: trip.date_end }, members, state.locked_plan_id, me.id)
        const item = plan?.itinerary.flatMap((d) => d.items).find((i) => i.key === body.key)
        if (!item) throw new ApiError('INVALID_INPUT', '任务不存在')
        if (item.ownerId !== me.id && me.role !== 'organizer') throw new ApiError('FORBIDDEN', '只能更新自己负责的任务')
        next = await repo.updateState(trip.id, body.expectedVersion, { tasks: { ...state.tasks, [body.key]: body.done } })
      } else {
        const paid = new Set(state.paid_members)
        if (body.paid) paid.add(me.id)
        else paid.delete(me.id)
        next = await repo.updateState(trip.id, body.expectedVersion, { paidMembers: [...paid] })
      }
      if (next === null) throw new ApiError('VERSION_CONFLICT', '数据已被其他成员更新，请刷新后重试')
      return buildView(trip, me)
    },

    async lock(slug: string, token: string | null, body: LockBody): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      requireOrganizer(me)
      if (body.planId) {
        const members = toConsensusMembers(await repo.listMembers(trip.id))
        const plan = computePlanById({ candidateDestinations: trip.candidate_destinations, dateStart: trip.date_start, dateEnd: trip.date_end }, members, body.planId, me.id)
        if (!plan) throw new ApiError('PLAN_NOT_FOUND', '方案不存在，请刷新后重试')
        if (members.filter((m) => m.prefs).length < 2) throw new ApiError('FORBIDDEN', '至少需要 2 位成员填写偏好后才能锁定方案')
      }
      const next = await repo.setLock(trip.id, body.expectedVersion, body.planId)
      if (next === null) throw new ApiError('VERSION_CONFLICT', '数据已被其他成员更新，请刷新后重试')
      return buildView(await loadTrip(slug), me)
    },

    async removeMember(slug: string, token: string | null, memberId: string): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      requireOrganizer(me)
      if (memberId === me.id) throw new ApiError('FORBIDDEN', '发起人不能移除自己')
      const ok = await repo.removeMember(trip.id, memberId)
      if (!ok) throw new ApiError('MEMBER_NOT_FOUND', '成员不存在')
      return buildView(trip, me)
    },
  }
}

export type Service = ReturnType<typeof createService>
