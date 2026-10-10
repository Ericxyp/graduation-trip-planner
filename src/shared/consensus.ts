/**
 * 云端旅行局的确定性共识引擎。
 *
 * 分两层：
 *  - 计算层（evaluatePlan / computeConsensus）：参与人数、人均预算、匹配度、冲突计数，全部确定性。
 *  - 解释层（explainPlan 等）：把计算结果转换为自然语言模板，不调用任何大模型。
 *
 * 隐私：输出只包含聚合计数和当前查看者自己的得分，绝不包含他人的预算、必选条件或底线条件。
 */
import { addDays, fmtMonthDay, rangeDays } from './dates.js'
import { profileOf, type DestinationProfile } from './destinations.js'
import { budgetMax, PACE_LABEL, type Pace, type StayPref } from './options.js'
import type { ConflictView, ConsensusView, CostLine, ItineraryDayView, MyPlanFit, PlanKind, PlanView, Preferences, Role } from './types.js'
import { DEST_RANK_RATIO, MATCH_WEIGHTS, PACE_ADJACENT_RATIO, type MatchDimension } from './weights.js'

export interface ConsensusMember {
  id: string
  displayName: string
  role: Role
  joinedAt: string
  prefs: Preferences | null
}

export interface ConsensusTrip {
  candidateDestinations: string[]
  dateStart: string
  dateEnd: string
}

export const MIN_FILLED_FOR_CONSENSUS = 2
export const DEFAULT_TRIP_DAYS = 4
const RESERVE_PER_PERSON = 150

type StayType = Exclude<StayPref, 'any'>
const STAY_OK: Record<StayType, StayPref[]> = {
  homestay: ['any', 'homestay'],
  hotel: ['any', 'hotel'],
  'private-bath': ['any', 'hotel', 'private-bath'],
}
const STAY_FACTOR: Record<StayType, number> = { homestay: 0.85, hotel: 1, 'private-bath': 1.15 }
const STAY_LABEL: Record<StayType, string> = { homestay: '整租民宿', hotel: '连锁酒店双床房', 'private-bath': '酒店双床房（独立卫浴）' }

const KIND_META: Record<PlanKind, { label: string; slogan: string }> = {
  consensus: { label: '最大共识', slogan: '让最多的人一起出发' },
  budget: { label: '最省钱', slogan: '把钱花在刀刃上' },
  memorable: { label: '最难忘', slogan: '大家最想去的地方' },
}

/* ---------------- 计算层 ---------------- */

export function planId(dest: string, start: string, days: number): string {
  return `${start}|${days}|${dest}`
}

export function parsePlanId(id: string): { dest: string; start: string; days: number } | null {
  const m = /^(\d{4}-\d{2}-\d{2})\|(\d{1,2})\|(.{1,40})$/.exec(id)
  if (!m) return null
  return { start: m[1], days: Number(m[2]), dest: m[3] }
}

export function tripLength(trip: ConsensusTrip): number {
  return Math.min(DEFAULT_TRIP_DAYS, rangeDays(trip.dateStart, trip.dateEnd).length)
}

/** 单项人均：个人部分 + 公共部分 / 人数，四舍五入到元；总人均由各项累加，保证前后一致 */
function costLines(p: DestinationProfile, n: number, days: number, stay: StayType): CostLine[] {
  const people = Math.max(n, 1)
  const nights = Math.max(days - 1, 1)
  const rooms = Math.ceil(people / 2)
  const cars = Math.ceil(people / 4)
  const per = (personal: number, shared: number) => Math.round(personal + shared / people)
  return [
    { key: 'transport', label: '往返交通', note: '出发城市往返大交通', perPerson: per(p.transport, 0), shared: false },
    { key: 'stay', label: '住宿', note: `${STAY_LABEL[stay]} × ${nights}晚`, perPerson: per(0, rooms * p.roomPerNight * STAY_FACTOR[stay] * nights), shared: true },
    { key: 'food', label: '餐饮', note: `每天三餐，共${days}天`, perPerson: per(p.foodPerDay * days, 0), shared: false },
    { key: 'ticket', label: '门票/活动', note: '景点门票与毕业跟拍', perPerson: per(p.tickets, 0), shared: false },
    { key: 'local', label: '公共交通', note: '市内拼车与地铁', perPerson: per(0, cars * p.localPerDayPerCar * days), shared: true },
    { key: 'reserve', label: '备用金', note: '每人预留，多退少补', perPerson: per(RESERVE_PER_PERSON, 0), shared: false },
  ]
}

export function perPersonOf(lines: CostLine[]): number {
  return lines.reduce((s, l) => s + l.perPerson, 0)
}

function mode<T extends string>(values: T[], order: T[]): T | null {
  if (!values.length) return null
  let best: T | null = null
  let bestCount = -1
  for (const v of order) {
    const c = values.filter((x) => x === v).length
    if (c > bestCount) {
      best = v
      bestCount = c
    }
  }
  return best
}

function vetoesFor(nos: string[], pace: Pace, p: DestinationProfile): string[] {
  const hit: string[] = []
  for (const n of nos) {
    if (n === '早于7点集合' && pace === 'rush') hit.push('早起集合')
    if (n === '一天暴走超过2万步' && pace === 'rush') hit.push('高强度步行')
    if (n === '35°C以上高温暴晒' && p.hot) hit.push('高温')
    if (n === '红眼航班或夜车' && p.redEye) hit.push('夜间交通')
    // 每间最多两人，“6人以上混住一间”不会触发
  }
  return hit
}

function unmetMusts(musts: string[], pace: Pace, p: DestinationProfile): string[] {
  const miss: string[] = []
  for (const m of musts) {
    if (m === '每天睡够7小时' && pace === 'rush') miss.push('睡眠时间')
    if (m === '单程交通5小时内' && p.hours > 5) miss.push('交通时长')
    if (m === '有山或海的风景' && !p.scenery) miss.push('山海风景')
    // 毕业合影、本地菜在所有方案的行程模板中均已安排
  }
  return miss
}

interface MemberEval {
  member: ConsensusMember
  dates: boolean
  budget: boolean
  destRank: number
  pace: boolean
  stay: boolean
  vetoes: string[]
  unmet: string[]
  parts: Record<MatchDimension, number>
  score: number
  participating: boolean
}

export interface EvaluatedPlan {
  dest: string
  start: string
  days: number
  pace: Pace
  stay: StayType
  profile: DestinationProfile
  participants: ConsensusMember[]
  lines: CostLine[]
  perPerson: number
  match: number
  evals: MemberEval[]
  enthusiasm: number
}

export function evaluatePlan(dest: string, start: string, days: number, members: ConsensusMember[]): EvaluatedPlan {
  const profile = profileOf(dest)
  const window = rangeDays(start, addDays(start, days - 1))
  const filled = members.filter((m) => m.prefs)
  const dateOk = filled.filter((m) => window.every((d) => m.prefs!.dates.includes(d)))

  const pace = mode<Pace>(dateOk.map((m) => m.prefs!.pace), ['balanced', 'relax', 'rush']) ?? 'balanced'
  const stayOrder: StayType[] = ['hotel', 'private-bath', 'homestay']
  let stay: StayType = 'hotel'
  let stayBest = -1
  for (const s of stayOrder) {
    const c = dateOk.filter((m) => STAY_OK[s].includes(m.prefs!.stay)).length
    if (c > stayBest) {
      stay = s
      stayBest = c
    }
  }

  // 先确定参与者（日期覆盖且未触发底线），再按参与人数计算人均
  const vetoMap = new Map(filled.map((m) => [m.id, vetoesFor(m.prefs!.nos, pace, profile)]))
  const participants = dateOk.filter((m) => vetoMap.get(m.id)!.length === 0)
  const lines = costLines(profile, participants.length, days, stay)
  const perPerson = perPersonOf(lines)

  const W = MATCH_WEIGHTS
  const evals: MemberEval[] = filled.map((m) => {
    const prefs = m.prefs!
    const dates = dateOk.includes(m)
    const budget = budgetMax(prefs.budgetId) >= perPerson
    const idx = prefs.destinations.indexOf(dest)
    const destRank = idx === -1 ? 0 : idx + 1
    const paceOk = prefs.pace === pace
    const stayOk = STAY_OK[stay].includes(prefs.stay)
    const parts: Record<MatchDimension, number> = {
      dates: dates ? W.dates : 0,
      budget: budget ? W.budget : 0,
      destination: Math.round(W.destination * (DEST_RANK_RATIO[destRank] ?? 0)),
      pace: paceOk ? W.pace : prefs.pace === 'balanced' || pace === 'balanced' ? Math.round(W.pace * PACE_ADJACENT_RATIO) : 0,
      stay: stayOk ? W.stay : 0,
    }
    const vetoes = vetoMap.get(m.id)!
    const raw = parts.dates + parts.budget + parts.destination + parts.pace + parts.stay
    // 一票否决：触发底线条件的成员不计入可参加人数，个人得分减半
    const score = vetoes.length ? Math.round(raw / 2) : raw
    return {
      member: m,
      dates,
      budget,
      destRank,
      pace: paceOk,
      stay: stayOk,
      vetoes,
      unmet: unmetMusts(prefs.musts, pace, profile),
      parts,
      score,
      participating: participants.includes(m),
    }
  })
  const match = evals.length ? Math.round(evals.reduce((s, e) => s + e.score, 0) / evals.length) : 0
  const enthusiasm = evals.reduce((s, e) => s + (DEST_RANK_RATIO[e.destRank] ?? 0), 0)

  return { dest, start, days, pace, stay, profile, participants, lines, perPerson, match, evals, enthusiasm }
}

/** 每个候选目的地选出参与人数最多（其次匹配度高、日期早）的日期窗口 */
function bestWindowFor(dest: string, trip: ConsensusTrip, members: ConsensusMember[]): EvaluatedPlan {
  const days = tripLength(trip)
  const starts = rangeDays(trip.dateStart, addDays(trip.dateEnd, -(days - 1)))
  let best: EvaluatedPlan | null = null
  for (const s of starts) {
    const e = evaluatePlan(dest, s, days, members)
    if (!best || e.participants.length > best.participants.length || (e.participants.length === best.participants.length && e.match > best.match)) best = e
  }
  return best!
}

const byConsensus = (a: EvaluatedPlan, b: EvaluatedPlan) =>
  b.match - a.match || b.participants.length - a.participants.length || a.perPerson - b.perPerson || a.dest.localeCompare(b.dest)

export function computeConsensus(trip: ConsensusTrip, members: ConsensusMember[], viewerId: string | null, now = new Date()): ConsensusView {
  const filledCount = members.filter((m) => m.prefs).length
  const base = { filledCount, memberCount: members.length, generatedAt: now.toISOString() }
  if (filledCount < MIN_FILLED_FOR_CONSENSUS) return { status: 'need_more', plans: [], ...base }

  const perDest = trip.candidateDestinations.map((d) => bestWindowFor(d, trip, members))
  const picked: { kind: PlanKind; plan: EvaluatedPlan }[] = []
  const used = new Set<string>()
  const take = (kind: PlanKind, pool: EvaluatedPlan[], cmp: (a: EvaluatedPlan, b: EvaluatedPlan) => number) => {
    const fresh = pool.filter((p) => !used.has(p.dest))
    const list = (fresh.length ? fresh : []).slice().sort(cmp)
    if (!list.length) return
    used.add(list[0].dest)
    picked.push({ kind, plan: list[0] })
  }
  take('consensus', perDest, byConsensus)
  const feasible = perDest.filter((p) => p.participants.length >= 2)
  take('budget', feasible.length ? feasible : perDest, (a, b) => a.perPerson - b.perPerson || b.match - a.match)
  take('memorable', perDest, (a, b) => b.enthusiasm - a.enthusiasm || b.match - a.match)

  return { status: 'ready', plans: picked.map((p) => toView(p.plan, p.kind, members, viewerId)), ...base }
}

/** 按方案 id 重新计算（用于已锁定方案：即使成员后来修改偏好，锁定的目的地与日期保持不变） */
export function computePlanById(trip: ConsensusTrip, members: ConsensusMember[], id: string, viewerId: string | null, kind: PlanKind = 'consensus'): PlanView | null {
  const p = parsePlanId(id)
  if (!p || !trip.candidateDestinations.includes(p.dest)) return null
  if (p.start < trip.dateStart || addDays(p.start, p.days - 1) > trip.dateEnd) return null
  return toView(evaluatePlan(p.dest, p.start, p.days, members), kind, members, viewerId)
}

/* ---------------- 解释层 ---------------- */

function toView(e: EvaluatedPlan, kind: PlanKind, members: ConsensusMember[], viewerId: string | null): PlanView {
  const filled = e.evals.length
  const end = addDays(e.start, e.days - 1)
  const dims = {
    filled,
    dateFit: e.evals.filter((x) => x.dates).length,
    budgetFit: e.evals.filter((x) => x.budget).length,
    topChoice: e.evals.filter((x) => x.destRank === 1).length,
    paceFit: e.evals.filter((x) => x.pace).length,
    stayFit: e.evals.filter((x) => x.participating && x.stay).length,
    vetoed: e.evals.filter((x) => x.dates && x.vetoes.length).length,
    mustUnmet: e.evals.filter((x) => x.participating && x.unmet.length).length,
  }
  const mine = viewerId ? e.evals.find((x) => x.member.id === viewerId) : undefined
  const myFit: MyPlanFit | null = mine
    ? {
        participating: mine.participating,
        dates: mine.dates,
        budget: mine.budget,
        destRank: mine.destRank,
        pace: mine.pace,
        stay: mine.stay,
        vetoed: mine.vetoes.length > 0,
        parts: mine.parts,
        score: mine.score,
      }
    : null

  const n = e.participants.length
  return {
    id: planId(e.dest, e.start, e.days),
    kind,
    label: KIND_META[kind].label,
    slogan: KIND_META[kind].slogan,
    destination: e.dest,
    dateStart: e.start,
    dateEnd: end,
    days: e.days,
    pace: e.pace,
    stayType: e.stay,
    stayLabel: STAY_LABEL[e.stay],
    participants: orderMembers(e.participants).map((m) => ({ id: m.id, displayName: m.displayName })),
    participantCount: n,
    memberCount: members.length,
    feasible: n >= 2,
    perPerson: e.perPerson,
    costs: e.lines,
    costEstimated: !e.profile.known,
    match: e.match,
    dims,
    tags: tagsOf(e, dims),
    conflicts: conflictsOf(e, dims),
    reasons: reasonsOf(e, dims),
    explanation: explainPlan(e, dims),
    itinerary: itineraryOf(e),
    myFit,
  }
}

function orderMembers(ms: ConsensusMember[]): ConsensusMember[] {
  return ms.slice().sort((a, b) => (a.role === b.role ? a.joinedAt.localeCompare(b.joinedAt) : a.role === 'organizer' ? -1 : 1))
}

type Dims = PlanView['dims']

function tagsOf(e: EvaluatedPlan, d: Dims): string[] {
  const t: string[] = []
  if (d.dateFit === d.filled) t.push('日期全员可行')
  if (d.budgetFit === d.filled) t.push('全员预算内')
  if (d.topChoice * 2 >= d.filled && d.topChoice > 0) t.push('多数人首选')
  if (e.profile.scenery && t.length < 3) t.push('有山有海')
  if (t.length < 3) t.push(`节奏${PACE_LABEL[e.pace]}`)
  return t.slice(0, 3)
}

function conflictsOf(e: EvaluatedPlan, d: Dims): ConflictView[] {
  const c: ConflictView[] = []
  const range = `${fmtMonthDay(e.start)}—${fmtMonthDay(addDays(e.start, e.days - 1))}`
  if (d.dateFit < d.filled) c.push({ title: '日期冲突', detail: `${d.filled - d.dateFit}人的可出发日期未完整覆盖${range}`, level: 'high' })
  if (d.vetoed > 0) {
    const kinds = [...new Set(e.evals.flatMap((x) => (x.dates ? x.vetoes : [])))].join('、')
    c.push({ title: '底线冲突', detail: `${d.vetoed}人的“不能接受”条件被触发（${kinds}），暂不计入可参加人数`, level: 'high' })
  }
  if (d.budgetFit < d.filled) c.push({ title: '预算超出', detail: `人均¥${e.perPerson.toLocaleString('zh-CN')}超出${d.filled - d.budgetFit}人的预算上限`, level: d.budgetFit * 2 < d.filled ? 'high' : 'mid' })
  const stayMiss = e.participants.length - d.stayFit
  if (stayMiss > 0) c.push({ title: '住宿偏好', detail: `${stayMiss}位参加成员的住宿要求未完全满足（方案为${STAY_LABEL[e.stay]}）`, level: 'mid' })
  if (d.mustUnmet > 0) {
    const kinds = [...new Set(e.evals.flatMap((x) => (x.participating ? x.unmet : [])))].join('、')
    c.push({ title: '必选条件', detail: `${d.mustUnmet}位参加成员的必选条件未满足（${kinds}）`, level: 'low' })
  }
  if (!e.profile.known) c.push({ title: '费用估算', detail: `${e.dest}暂无本地价格画像，人均费用为通用估算`, level: 'low' })
  return c.slice(0, 4)
}

function reasonsOf(e: EvaluatedPlan, d: Dims): string[] {
  const r: string[] = []
  if (d.topChoice > 0) r.push(`${d.topChoice}位同学把${e.dest}排在第一志愿`)
  r.push(`${fmtMonthDay(e.start)}起${e.days}天，${d.dateFit}/${d.filled}位已填写成员的日期可以覆盖`)
  r.push(`人均约¥${e.perPerson.toLocaleString('zh-CN')}，符合${d.budgetFit}人的预算预期`)
  if (e.profile.known) r.push(`单程约${e.profile.hours}小时，行程节奏按多数人偏好定为“${PACE_LABEL[e.pace]}”`)
  return r.slice(0, 3)
}

export function explainPlan(e: EvaluatedPlan, d: Dims): string {
  const n = e.participants.length
  const total = e.evals.length === 0 ? 0 : d.filled
  const stayMiss = n - d.stayFit
  const stayText = stayMiss === 0 ? '所有参加成员的住宿要求都已满足。' : `${stayMiss}人的住宿要求未完全满足。`
  if (n < 2) return `${e.dest}方案目前只有${n}人可以同时出发，暂不具备成行条件；建议放宽日期或底线条件后再比较。`
  return `${e.dest}方案覆盖${n}/${total}位已填写成员，日期交集${e.days}天；整体预算符合${d.budgetFit}人的预期，${stayText}`
}

function itineraryOf(e: EvaluatedPlan): ItineraryDayView[] {
  const owners = orderMembers(e.participants)
  const pick = (i: number) => owners.length ? owners[i % owners.length] : null
  const s = e.profile.spots
  const id = planId(e.dest, e.start, e.days)
  let k = 0
  const item = (time: string, place: string, activity: string, cost: number) => {
    const o = pick(k++)
    return { key: '', time, place, activity, cost, ownerId: o?.id ?? '', ownerName: o?.displayName ?? '待分配' }
  }
  const templates: { title: string; items: ReturnType<typeof item>[] }[] = [
    { title: '抵达 · 入住 · 欢迎聚餐', items: [item('09:00', `出发 → ${e.dest}`, '集合出发，统一购票与分组', 0), item('15:30', `${e.dest}住宿点`, `办理入住（${STAY_LABEL[e.stay]}），分配房间`, 0), item('19:00', `${e.dest}本地餐馆`, '欢迎聚餐，确认分工', 90)] },
    { title: '城市体验', items: [item(e.pace === 'relax' ? '10:00' : '08:30', s[0], '上午主线景点', 60), item('14:00', s[1], '下午城市漫游', 40), item('19:30', `${e.dest}夜市`, '夜景与小吃', 60)] },
    { title: '毕业纪念活动', items: [item('09:30', s[2], '毕业合影，跟拍师全程', 60), item('15:00', `${e.dest}手作工坊`, '手作毕业纪念册', 40), item('19:00', `${e.dest}餐厅`, '毕业晚宴 + 时光信封', 110)] },
    { title: '自由活动 · 返程', items: [item('10:00', `${e.dest}市中心`, '分组自由活动，买伴手礼', 0), item('13:00', `${e.dest}住宿点`, '退房，结算公共开销', 0), item('16:30', `${e.dest} → 出发城市`, '返程，到家后群里报平安', 0)] },
  ]
  const chosen = e.days >= 4 ? templates : e.days === 3 ? [templates[0], templates[2], templates[3]] : e.days === 2 ? [templates[0], templates[3]] : [templates[3]]
  return chosen.map((t, di) => ({
    date: addDays(e.start, di),
    title: t.title,
    items: t.items.map((it, ii) => ({ ...it, key: `${id}#${di}-${ii}` })),
  }))
}
