/**
 * 业务层：身份校验、权限判断与 DTO 组装。
 * 权限只依据服务端查到的成员记录（role / left_at），从不信任客户端传入的角色、成员 ID 或旅行局 ID。
 */
import { activityText, leaveOf } from '../src/shared/activity.js'
import { computeConsensus, computePlanById, type ConsensusMember, type ConsensusTrip } from '../src/shared/consensus.js'
import { computeBalances, minTransfers, splitEqual } from '../src/shared/ledger.js'
import type {
  CreateTripBody,
  ExpenseCreateBody,
  ExpenseUpdateBody,
  InviteBody,
  JoinTripBody,
  LockBody,
  PreferencesBody,
  RecoverBody,
  StatePatchBody,
} from '../src/shared/schemas.js'
import type {
  CreateTripResult,
  InviteStatus,
  JoinTripResult,
  LeaveResult,
  LeaveSummary,
  LedgerView,
  MemberSummary,
  PlanView,
  PublicTrip,
  TripView,
} from '../src/shared/types.js'
import type { Db } from './db.js'
import { ApiError } from './errors.js'
import { enforceLimit, LIMITS } from './limits.js'
import type { MemberRow, MemberWithPrefs, Repo, StateRow, TripRow } from './repo.js'
import { hashSecret, isPlausibleToken, newInviteCode, newRecoveryCode, newSlug, newToken, normalizeInviteCode, verifySecret } from './security.js'

export interface ServiceDeps {
  repo: Repo
  db: Db
  pepper: string
  appOrigin: string
  /** 调用方 IP（只用于限流，进入 HMAC 后才落库） */
  clientIp?: string
  now?: () => Date
}

export function inviteStatusOf(t: TripRow, now: Date): InviteStatus {
  if (t.status === 'archived') return 'closed'
  if (t.member_count >= t.member_limit) return 'full'
  if (t.invite_paused) return 'paused'
  if (t.invite_deadline && new Date(t.invite_deadline).getTime() < now.getTime()) return 'expired'
  return 'open'
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
    inviteStatus: inviteStatusOf(t, now),
  }
}

/** 公开的成员摘要：只有昵称、角色、颜色和“是否已填写”，没有任何偏好内容 */
export function toMemberSummary(m: MemberWithPrefs): MemberSummary {
  return { id: m.id, displayName: m.display_name, role: m.role, color: m.color ?? '#7A8094', hasPreferences: !!m.prefs, joinedAt: m.joined_at }
}

const active = <T extends { left_at: string | null }>(ms: T[]) => ms.filter((m) => !m.left_at)

function toConsensusMembers(ms: MemberWithPrefs[]): ConsensusMember[] {
  return active(ms).map((m) => ({ id: m.id, displayName: m.display_name, role: m.role, joinedAt: m.joined_at, prefs: m.prefs }))
}

const tripShape = (t: TripRow): ConsensusTrip => ({ candidateDestinations: t.candidate_destinations, dateStart: t.date_start, dateEnd: t.date_end })

/** 锁定时固化任务负责人：key → memberId */
export function assignmentsOf(plan: PlanView | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const d of plan?.itinerary ?? []) for (const i of d.items) if (i.ownerId) out[i.key] = i.ownerId
  return out
}

/** 只把“离开者”名下的任务重新分配给当前任务最少的参加成员（平局按加入顺序），其余负责人不变 */
export function reassignTasks(assignments: Record<string, string>, leavingId: string, candidates: string[]): { next: Record<string, string>; moved: number } {
  const next = { ...assignments }
  const pool = candidates.filter((id) => id !== leavingId)
  let moved = 0
  if (!pool.length) {
    for (const k of Object.keys(next)) if (next[k] === leavingId) delete next[k]
    return { next, moved }
  }
  const load = new Map(pool.map((id) => [id, 0]))
  for (const v of Object.values(next)) if (load.has(v)) load.set(v, load.get(v)! + 1)
  for (const k of Object.keys(next).sort()) {
    if (next[k] !== leavingId) continue
    const target = pool.slice().sort((a, b) => load.get(a)! - load.get(b)! || pool.indexOf(a) - pool.indexOf(b))[0]
    next[k] = target
    load.set(target, load.get(target)! + 1)
    moved++
  }
  return { next, moved }
}

function applyAssignments(plan: PlanView | null, assignments: Record<string, string>, names: Map<string, string>): PlanView | null {
  if (!plan) return plan
  return {
    ...plan,
    itinerary: plan.itinerary.map((d) => ({
      ...d,
      items: d.items.map((i) => {
        const owner = assignments[i.key]
        return owner && names.has(owner) ? { ...i, ownerId: owner, ownerName: names.get(owner)! } : i
      }),
    })),
  }
}

export function createService(deps: ServiceDeps) {
  const { repo, pepper } = deps
  const now = deps.now ?? (() => new Date())
  const ip = deps.clientIp ?? 'unknown'

  async function loadTrip(slug: string): Promise<TripRow> {
    if (!/^[a-z0-9]{6,32}$/.test(slug)) throw new ApiError('TRIP_NOT_FOUND', '旅行局不存在或已被删除')
    const trip = await repo.findTrip(slug)
    if (!trip) throw new ApiError('TRIP_NOT_FOUND', '旅行局不存在或已被删除')
    return trip
  }

  /** 按 Bearer token 找成员；allowLeft 仅用于“退出”接口的幂等处理 */
  async function authenticate(trip: TripRow, token: string | null, allowLeft = false): Promise<MemberRow> {
    if (!token || !isPlausibleToken(token)) throw new ApiError('UNAUTHORIZED', '请先加入旅行局')
    const member = await repo.findMemberByToken(trip.id, hashSecret(token, pepper, 'token'))
    if (!member) throw new ApiError('UNAUTHORIZED', '身份已失效，请重新加入旅行局')
    if (member.left_at && !allowLeft) throw new ApiError('MEMBER_LEFT', '你已退出这个旅行局')
    return member
  }

  function requireOrganizer(m: MemberRow) {
    if (m.role !== 'organizer') throw new ApiError('FORBIDDEN', '只有发起人可以执行此操作')
  }
  function requireWritable(t: TripRow) {
    if (t.status === 'archived') throw new ApiError('TRIP_ARCHIVED', '旅行局已解散，只能查看')
  }

  /** 当前“团队参考方案”：已锁定方案，否则最大共识方案 */
  function referencePlan(trip: TripRow, state: StateRow, members: MemberWithPrefs[], viewerId: string | null): PlanView | null {
    const cm = toConsensusMembers(members)
    if (state.locked_plan_id) return computePlanById(tripShape(trip), cm, state.locked_plan_id, viewerId)
    const c = computeConsensus(tripShape(trip), cm, viewerId, now())
    return c.plans[0] ?? null
  }

  function buildLedger(trip: TripRow, state: StateRow, members: MemberWithPrefs[], me: MemberRow, expenses: Awaited<ReturnType<Repo['listExpenses']>>): LedgerView {
    const byId = new Map(members.map((m) => [m.id, m]))
    const name = (id: string) => byId.get(id)?.display_name ?? '已删除成员'
    const left = (id: string) => !!byId.get(id)?.left_at
    const order = members.map((m) => m.id)
    const touched = new Set<string>()
    for (const e of expenses) {
      touched.add(e.paid_by_member_id)
      e.shares.forEach((s) => touched.add(s.member_id))
    }
    const shown = order.filter((id) => !left(id) || touched.has(id))
    const balances = computeBalances(
      expenses.map((e) => ({ id: e.id, amountCents: e.amount_cents, paidBy: e.paid_by_member_id, shares: e.shares.map((s) => ({ memberId: s.member_id, shareCents: s.share_cents })) })),
      shown,
    )
    const transfers = minTransfers(balances)
    const writable = trip.status !== 'archived'
    return {
      enabled: !!state.locked_plan_id || expenses.length > 0,
      totalCents: expenses.reduce((s, e) => s + e.amount_cents, 0),
      expenses: expenses.map((e) => ({
        id: e.id,
        title: e.title,
        category: e.category,
        amountCents: e.amount_cents,
        paidBy: { id: e.paid_by_member_id, displayName: name(e.paid_by_member_id), left: left(e.paid_by_member_id) },
        splitMethod: e.split_method,
        shares: e.shares.map((s) => ({ memberId: s.member_id, displayName: name(s.member_id), shareCents: s.share_cents })),
        createdBy: name(e.created_by_member_id),
        createdAt: e.created_at,
        version: e.version,
        canEdit: writable && (me.role === 'organizer' || e.created_by_member_id === me.id || e.paid_by_member_id === me.id),
      })),
      balances: balances.map((b) => ({ ...b, displayName: name(b.memberId), left: left(b.memberId) })),
      transfers: transfers.map((t) => ({ ...t, fromName: name(t.from), toName: name(t.to) })),
    }
  }

  async function buildView(trip: TripRow, me: MemberRow): Promise<TripView> {
    const [members, state, expenses, activity] = await Promise.all([repo.listMembers(trip.id), repo.getState(trip.id), repo.listExpenses(trip.id), repo.listActivity(trip.id, 20)])
    const act = active(members)
    const cm = toConsensusMembers(members)
    const consensus = computeConsensus(tripShape(trip), cm, me.id, now())
    const names = new Map(act.map((m) => [m.id, m.display_name]))
    const lockedRaw = state.locked_plan_id
      ? computePlanById(tripShape(trip), cm, state.locked_plan_id, me.id, consensus.plans.find((p) => p.id === state.locked_plan_id)?.kind ?? 'consensus')
      : null
    const lockedPlan = applyAssignments(lockedRaw, state.assignments, names)
    const mine = members.find((m) => m.id === me.id)
    const memberIds = new Set(act.map((m) => m.id))
    return {
      trip: toPublicTrip({ ...trip, member_count: act.length }, now()),
      me: { memberId: me.id, displayName: me.display_name, role: me.role, preferences: mine?.prefs ?? null },
      members: act.map(toMemberSummary),
      filledCount: act.filter((m) => m.prefs).length,
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
      revision: trip.revision + state.version,
      serverTime: now().toISOString(),
      admin: me.role === 'organizer' ? { inviteVersion: trip.invite_version, invitePaused: trip.invite_paused, hasRecoveryCode: !!trip.recovery_code_hash } : null,
      ledger: buildLedger(trip, state, members, me, expenses),
      activity: activity.map((a) => ({ id: a.id, type: a.type, text: activityText(a.type, a.payload), at: a.created_at, ...(a.type === 'member_left' || a.type === 'member_removed' ? { leave: leaveOf(a.payload) } : {}) })),
    }
  }

  const viewFresh = async (slug: string, me: MemberRow) => buildView(await loadTrip(slug), me)

  /** 退出与移除共用：带重试的乐观并发（最多 4 次） */
  async function removeFromTrip(trip: TripRow, target: MemberRow, actor: MemberRow, kind: 'member_left' | 'member_removed'): Promise<LeaveResult> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const [members, state] = await Promise.all([repo.listMembers(trip.id), repo.getState(trip.id)])
      const current = members.find((m) => m.id === target.id)
      if (!current || current.left_at) return { status: 'already_left', summary: null }
      const before = referencePlan(trip, state, members, null)
      const after = before ? computePlanById(tripShape(trip), toConsensusMembers(members.filter((m) => m.id !== target.id)), before.id, null) : null
      const candidates = (after?.participants.map((p) => p.id) ?? []).concat(active(members).map((m) => m.id)).filter((id, i, arr) => arr.indexOf(id) === i)
      const { next, moved } = reassignTasks(state.assignments, target.id, candidates)
      const summary: LeaveSummary = {
        name: target.display_name,
        countBefore: before?.participantCount ?? 0,
        countAfter: after?.participantCount ?? 0,
        perPersonBefore: before?.perPerson ?? 0,
        perPersonAfter: after?.perPerson ?? 0,
        reassigned: moved,
        lockedDestination: state.locked_plan_id ? before?.destination ?? null : null,
        planDestination: before?.destination ?? null,
      }
      const r = await repo.leaveMember({
        tripId: trip.id,
        memberId: target.id,
        expectedVersion: state.version,
        assignments: next,
        paidMembers: state.paid_members ?? [],
        event: { type: kind, actorId: actor.id, payload: { actor: kind === 'member_left' ? target.display_name : actor.display_name, target: target.display_name, leave: summary } },
      })
      if (r === 'left') return { status: 'left', summary }
      if (r === 'already_left') return { status: 'already_left', summary: null }
    }
    throw new ApiError('VERSION_CONFLICT', '旅行局正在被频繁更新，请稍后重试')
  }

  /** 计算一笔费用的分摊（服务端权威）：返回按加入顺序排列的 memberId → 分 */
  async function sharesFor(trip: TripRow, body: ExpenseCreateBody | ExpenseUpdateBody): Promise<Map<string, number>> {
    const [members, state] = await Promise.all([repo.listMembers(trip.id), repo.getState(trip.id)])
    const act = active(members)
    const actIds = act.map((m) => m.id)
    if (!actIds.includes(body.paidBy)) throw new ApiError('INVALID_INPUT', '垫付人必须是旅行局当前成员')
    const split = body.split
    if (split.splitMethod === 'equal_all') {
      const plan = referencePlan(trip, state, members, null)
      const ids = plan?.participants.map((p) => p.id).filter((id) => actIds.includes(id)) ?? []
      return splitEqual(body.amountCents, ids.length ? ids : actIds)
    }
    if (split.splitMethod === 'equal_selected') {
      const set = new Set(split.memberIds)
      if (set.size !== split.memberIds.length) throw new ApiError('INVALID_INPUT', '分摊成员不能重复')
      if ([...set].some((id) => !actIds.includes(id))) throw new ApiError('INVALID_INPUT', '分摊成员必须是旅行局当前成员')
      return splitEqual(body.amountCents, actIds.filter((id) => set.has(id)))
    }
    const seen = new Set<string>()
    let sum = 0
    for (const s of split.shares) {
      if (seen.has(s.memberId)) throw new ApiError('INVALID_INPUT', '分摊成员不能重复')
      if (!actIds.includes(s.memberId)) throw new ApiError('INVALID_INPUT', '分摊成员必须是旅行局当前成员')
      seen.add(s.memberId)
      sum += s.shareCents
    }
    if (sum !== body.amountCents) throw new ApiError('INVALID_INPUT', `自定义分摊合计 ${sum / 100} 元，与费用总额 ${body.amountCents / 100} 元不一致`)
    const out = new Map<string, number>()
    for (const id of actIds) {
      const s = split.shares.find((x) => x.memberId === id)
      if (s && s.shareCents > 0) out.set(id, s.shareCents)
    }
    if (!out.size) throw new ApiError('INVALID_INPUT', '至少需要一位成员承担费用')
    return out
  }

  return {
    async createTrip(body: CreateTripBody): Promise<CreateTripResult> {
      await enforceLimit(deps.db, pepper, LIMITS.createPerIp, ip)
      const code = newInviteCode()
      const token = newToken()
      const recovery = newRecoveryCode()
      let created: { tripId: string; memberId: string } | null = null
      let slug = ''
      for (let attempt = 0; attempt < 3 && !created; attempt++) {
        slug = newSlug()
        try {
          created = await repo.createTrip({
            slug,
            inviteCodeHash: hashSecret(code, pepper, 'invite'),
            organizerTokenHash: hashSecret(token, pepper, 'token'),
            recoveryCodeHash: hashSecret(recovery, pepper, 'recovery'),
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
        recovery: { code: formatRecovery(recovery) },
      }
    },

    async getPublic(slug: string): Promise<PublicTrip> {
      return toPublicTrip(await loadTrip(slug), now())
    },

    async join(slug: string, body: JoinTripBody): Promise<JoinTripResult> {
      const trip = await loadTrip(slug)
      await enforceLimit(deps.db, pepper, LIMITS.joinPerIpTrip, `${ip}|${trip.id}`)
      await enforceLimit(deps.db, pepper, LIMITS.joinPerTrip, trip.id)
      if (trip.status === 'archived') throw new ApiError('TRIP_ARCHIVED', '旅行局已解散，无法加入')
      if (!verifySecret(normalizeInviteCode(body.inviteCode), trip.invite_code_hash, pepper, 'invite')) throw new ApiError('INVALID_INVITE_CODE', '邀请码不正确，请向发起人确认')
      const status = inviteStatusOf(trip, now())
      if (status === 'paused') throw new ApiError('INVITE_PAUSED', '发起人已暂停邀请，请稍后再试')
      if (status === 'expired') throw new ApiError('INVITE_EXPIRED', '邀请已过期，请联系发起人')
      const token = newToken()
      const r = await repo.joinTrip({ tripId: trip.id, displayName: body.displayName, tokenHash: hashSecret(token, pepper, 'token') })
      if (r.status !== 'joined') {
        throw r.status === 'name_taken'
          ? new ApiError('DISPLAY_NAME_TAKEN', '这个昵称已被使用，换一个试试')
          : r.status === 'name_taken_by_left'
            ? new ApiError('DISPLAY_NAME_TAKEN', '这个昵称属于一位已退出的成员，请换一个昵称')
            : new ApiError('MEMBER_LIMIT_REACHED', '旅行局人数已满')
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
      requireWritable(trip)
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
      const had = (await repo.listMembers(trip.id)).find((m) => m.id === me.id)?.prefs
      await repo.upsertPreferences(
        trip.id,
        { id: me.id, name: me.display_name },
        { dates: dedupe(body.dates).sort(), budgetId: body.budgetId, destinations: dedupe(body.destinations), pace: body.pace, stay: body.stay, musts: dedupe(body.musts), nos: dedupe(body.nos) },
        !!had,
      )
      return buildView(trip, me)
    },

    async patchState(slug: string, token: string | null, body: StatePatchBody): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      requireWritable(trip)
      const state = await repo.getState(trip.id)
      if (state.version !== body.expectedVersion) throw new ApiError('VERSION_CONFLICT', '数据已被其他成员更新，请刷新后重试')
      let next: number | null
      if (body.op === 'task') {
        if (!state.locked_plan_id) throw new ApiError('NOT_LOCKED', '方案锁定后才能更新任务')
        const members = await repo.listMembers(trip.id)
        const names = new Map(active(members).map((m) => [m.id, m.display_name]))
        const plan = applyAssignments(computePlanById(tripShape(trip), toConsensusMembers(members), state.locked_plan_id, me.id), state.assignments, names)
        const item = plan?.itinerary.flatMap((d) => d.items).find((i) => i.key === body.key)
        if (!item) throw new ApiError('INVALID_INPUT', '任务不存在')
        if (item.ownerId !== me.id && me.role !== 'organizer') throw new ApiError('FORBIDDEN', '只能更新自己负责的任务')
        next = await repo.updateState(trip.id, body.expectedVersion, { tasks: { ...state.tasks, [body.key]: body.done } }, { type: body.done ? 'task_done' : 'task_reopened', actorId: me.id, payload: { actor: me.display_name, title: item.activity } })
      } else {
        const paid = new Set(state.paid_members)
        if (body.paid) paid.add(me.id)
        else paid.delete(me.id)
        next = await repo.updateState(trip.id, body.expectedVersion, { paidMembers: [...paid] }, { type: body.paid ? 'paid_marked' : 'paid_unmarked', actorId: me.id, payload: { actor: me.display_name } })
      }
      if (next === null) throw new ApiError('VERSION_CONFLICT', '数据已被其他成员更新，请刷新后重试')
      return buildView(trip, me)
    },

    async lock(slug: string, token: string | null, body: LockBody): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      requireOrganizer(me)
      requireWritable(trip)
      let assignments: Record<string, string> = {}
      let destination = ''
      if (body.planId) {
        const members = await repo.listMembers(trip.id)
        const cm = toConsensusMembers(members)
        const plan = computePlanById(tripShape(trip), cm, body.planId, me.id)
        if (!plan) throw new ApiError('PLAN_NOT_FOUND', '方案不存在，请刷新后重试')
        if (cm.filter((m) => m.prefs).length < 2) throw new ApiError('FORBIDDEN', '至少需要 2 位成员填写偏好后才能锁定方案')
        assignments = assignmentsOf(plan)
        destination = plan.destination
      }
      const next = await repo.setLock(trip.id, body.expectedVersion, body.planId, assignments, body.planId
        ? { type: 'plan_locked', actorId: me.id, payload: { actor: me.display_name, destination } }
        : { type: 'plan_unlocked', actorId: me.id, payload: { actor: me.display_name } })
      if (next === null) throw new ApiError('VERSION_CONFLICT', '数据已被其他成员更新，请刷新后重试')
      return viewFresh(slug, me)
    },

    /* ---------------- 成员退出 / 移除 / 转让 / 解散 ---------------- */

    async leave(slug: string, token: string | null): Promise<LeaveResult> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token, true)
      if (me.left_at) return { status: 'already_left', summary: null }
      if (me.role === 'organizer') throw new ApiError('ORGANIZER_CANNOT_LEAVE', '发起人不能直接退出，请先转让发起人身份或解散旅行局')
      requireWritable(trip)
      return removeFromTrip(trip, me, me, 'member_left')
    },

    async removeMember(slug: string, token: string | null, memberId: string): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      requireOrganizer(me)
      requireWritable(trip)
      if (memberId === me.id) throw new ApiError('FORBIDDEN', '发起人不能移除自己')
      const target = (await repo.listMembers(trip.id)).find((m) => m.id === memberId && !m.left_at)
      if (!target) throw new ApiError('MEMBER_NOT_FOUND', '成员不存在')
      await removeFromTrip(trip, target, me, 'member_removed')
      return viewFresh(slug, me)
    },

    async transferOrganizer(slug: string, token: string | null, toId: string): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      requireOrganizer(me)
      requireWritable(trip)
      const target = (await repo.listMembers(trip.id)).find((m) => m.id === toId && !m.left_at && m.role === 'member')
      if (!target) throw new ApiError('MEMBER_NOT_FOUND', '只能转让给旅行局中的其他成员')
      const ok = await repo.transferOrganizer(trip.id, { id: me.id, name: me.display_name }, { id: target.id, name: target.display_name })
      if (!ok) throw new ApiError('VERSION_CONFLICT', '转让失败，请刷新后重试')
      return viewFresh(slug, { ...me, role: 'member' })
    },

    async archive(slug: string, token: string | null): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      requireOrganizer(me)
      if (trip.status !== 'archived') await repo.archiveTrip(trip.id, { id: me.id, name: me.display_name })
      return viewFresh(slug, me)
    },

    /* ---------------- 发起人恢复 ---------------- */

    async recoverOrganizer(slug: string, body: RecoverBody): Promise<JoinTripResult> {
      const trip = await loadTrip(slug)
      // 先计数再校验：无论对错都消耗次数，防止暴力尝试
      await enforceLimit(deps.db, pepper, LIMITS.recoverPerIpTrip, `${ip}|${trip.id}`)
      await enforceLimit(deps.db, pepper, LIMITS.recoverPerTrip, trip.id)
      const { hash, organizer } = await repo.getRecoveryTarget(trip.id)
      if (!hash || !organizer || !verifySecret(body.recoveryCode, hash, pepper, 'recovery')) throw new ApiError('INVALID_RECOVERY_CODE', '恢复码不正确，或该旅行局尚未设置恢复码')
      const token = newToken()
      await repo.createSession(trip.id, organizer.id, hashSecret(token, pepper, 'token'), { type: 'organizer_recovered', actorId: organizer.id, payload: { actor: organizer.display_name } })
      return { trip: toPublicTrip(await loadTrip(slug), now()), identity: { memberId: organizer.id, memberToken: token, role: 'organizer' } }
    },

    /** 发起人在已登录设备上（重新）生成恢复码；旧恢复码立即失效。阶段二创建的旅行局用它补设恢复码 */
    async resetRecoveryCode(slug: string, token: string | null): Promise<{ recovery: { code: string } }> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      requireOrganizer(me)
      requireWritable(trip)
      const code = newRecoveryCode()
      await repo.setRecoveryHash(trip.id, hashSecret(code, pepper, 'recovery'), { type: 'recovery_code_reset', actorId: me.id, payload: { actor: me.display_name } })
      return { recovery: { code: formatRecovery(code) } }
    },

    /* ---------------- 邀请管理 ---------------- */

    async updateInvite(slug: string, token: string | null, body: InviteBody): Promise<{ view: TripView; invite: { code: string; url: string } | null }> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      requireOrganizer(me)
      requireWritable(trip)
      if (trip.invite_version !== body.expectedInviteVersion) throw new ApiError('VERSION_CONFLICT', '邀请设置已被更新，请刷新后重试')
      const actor = { actor: me.display_name }
      let code: string | null = null
      let next: number | null
      if (body.action === 'regenerate') {
        await enforceLimit(deps.db, pepper, LIMITS.inviteRegenerate, trip.id)
        code = newInviteCode()
        next = await repo.updateInvite(trip.id, body.expectedInviteVersion, { codeHash: hashSecret(code, pepper, 'invite') }, { type: 'invite_regenerated', actorId: me.id, payload: actor })
      } else if (body.action === 'pause' || body.action === 'resume') {
        next = await repo.updateInvite(trip.id, body.expectedInviteVersion, { paused: body.action === 'pause' }, { type: body.action === 'pause' ? 'invite_paused' : 'invite_resumed', actorId: me.id, payload: actor })
      } else {
        if (body.inviteDeadline && new Date(body.inviteDeadline).getTime() <= now().getTime()) throw new ApiError('INVALID_INPUT', '截止时间需晚于现在')
        next = await repo.updateInvite(trip.id, body.expectedInviteVersion, { deadline: body.inviteDeadline }, { type: 'invite_deadline', actorId: me.id, payload: { ...actor, deadline: body.inviteDeadline } })
      }
      if (next === null) throw new ApiError('VERSION_CONFLICT', '邀请设置已被更新，请刷新后重试')
      return { view: await viewFresh(slug, me), invite: code ? { code, url: `${deps.appOrigin}/trip/${slug}/join#code=${code}` } : null }
    },

    /* ---------------- 实际费用台账 ---------------- */

    async createExpense(slug: string, token: string | null, body: ExpenseCreateBody): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      requireWritable(trip)
      const state = await repo.getState(trip.id)
      if (!state.locked_plan_id) throw new ApiError('NOT_LOCKED', '发起人锁定方案后才能记录实际费用')
      const shares = await sharesFor(trip, body)
      await repo.insertExpense(
        trip.id,
        { title: body.title, category: body.category, amountCents: body.amountCents, paidBy: body.paidBy, splitMethod: body.split.splitMethod, createdBy: me.id, shares },
        { type: 'expense_added', actorId: me.id, payload: { actor: me.display_name, title: body.title, cents: body.amountCents } },
      )
      return viewFresh(slug, me)
    },

    async updateExpense(slug: string, token: string | null, expenseId: string, body: ExpenseUpdateBody): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      requireWritable(trip)
      const e = await repo.findExpense(trip.id, expenseId) // 资源必须属于当前旅行局
      if (!e) throw new ApiError('EXPENSE_NOT_FOUND', '费用不存在或已删除')
      if (!(me.role === 'organizer' || e.created_by_member_id === me.id || e.paid_by_member_id === me.id)) throw new ApiError('FORBIDDEN', '只有记录人、垫付人或发起人可以修改这笔费用')
      if (e.version !== body.expectedVersion) throw new ApiError('VERSION_CONFLICT', '这笔费用刚被其他人修改，请刷新后重试')
      const shares = await sharesFor(trip, body)
      const ok = await repo.updateExpense(
        trip.id,
        expenseId,
        body.expectedVersion,
        { title: body.title, category: body.category, amountCents: body.amountCents, paidBy: body.paidBy, splitMethod: body.split.splitMethod, shares },
        { type: 'expense_updated', actorId: me.id, payload: { actor: me.display_name, title: body.title, cents: body.amountCents } },
      )
      if (!ok) throw new ApiError('VERSION_CONFLICT', '这笔费用刚被其他人修改，请刷新后重试')
      return viewFresh(slug, me)
    },

    async deleteExpense(slug: string, token: string | null, expenseId: string, expectedVersion: number): Promise<TripView> {
      const trip = await loadTrip(slug)
      const me = await authenticate(trip, token)
      requireWritable(trip)
      const e = await repo.findExpense(trip.id, expenseId)
      if (!e) throw new ApiError('EXPENSE_NOT_FOUND', '费用不存在或已删除')
      if (!(me.role === 'organizer' || e.created_by_member_id === me.id || e.paid_by_member_id === me.id)) throw new ApiError('FORBIDDEN', '只有记录人、垫付人或发起人可以删除这笔费用')
      const ok = await repo.deleteExpense(trip.id, expenseId, expectedVersion, { type: 'expense_deleted', actorId: me.id, payload: { actor: me.display_name, title: e.title, cents: e.amount_cents } })
      if (!ok) throw new ApiError('VERSION_CONFLICT', '这笔费用刚被其他人修改，请刷新后重试')
      return viewFresh(slug, me)
    },
  }
}

/** 恢复码显示为 4×4 分组，校验时去掉分隔符 */
function formatRecovery(code: string): string {
  return code.match(/.{4}/g)!.join('-')
}

export type Service = ReturnType<typeof createService>
