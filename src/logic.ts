import { BUDGET_OPTIONS, MEMBERS, SCHEMES } from './data'
import type { CostItem, MemberId, MyPrefs, Scheme, SchemeId } from './types'

import { DEST_RANK_RATIO, MATCH_WEIGHTS, PACE_ADJACENT_RATIO, type MatchDimension } from './shared/weights'

/** 权重与说明来自 src/shared/weights.ts，演示与云端规则引擎共用 */
export { DEST_RANK_RATIO, MATCH_DIMENSIONS, MATCH_WEIGHTS, PACE_ADJACENT_RATIO, type MatchDimension } from './shared/weights'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function fmtMD(s: string) {
  const d = parseDate(s)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function fmtDot(s: string) {
  const d = parseDate(s)
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function weekday(s: string) {
  return WEEK[parseDate(s).getDay()]
}

export function addDays(s: string, n: number) {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function rangeDays(start: string, end: string) {
  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

export const yuan = (n: number) => `¥${Math.round(n).toLocaleString('zh-CN')}`

/** 单项人均（四舍五入到元），所有展示金额都由它累加，保证前后一致 */
export function categoryPerPerson(c: CostItem, n: number) {
  return Math.round(c.personal + (n > 0 ? c.shared / n : 0))
}

export function perPersonFor(costs: CostItem[], n: number) {
  if (n <= 0) return 0
  return costs.reduce((sum, c) => sum + categoryPerPerson(c, n), 0)
}

export interface MyFit {
  dates: boolean
  budget: boolean
  destRank: number // 0 = 未选
  pace: boolean
  stay: boolean
  score: number
  parts: Record<MatchDimension, number>
}

export interface SchemeStats {
  participants: MemberId[]
  count: number
  filledCount: number
  perPerson: number
  match: number
  budgetFitCount: number
  stayMissCount: number
  topChoiceCount: number
  dateFitCount: number
  overlapDays: number
  myFit: MyFit | null
  explanation: string
}

export function budgetMaxOf(prefs: MyPrefs) {
  return BUDGET_OPTIONS.find((b) => b.id === prefs.budget)?.max ?? 0
}

export function computeStats(s: Scheme, prefs: MyPrefs | null): SchemeStats {
  const days = rangeDays(s.start, s.end)
  let participants = [...s.baseParticipants]
  let myFit: MyFit | null = null

  if (prefs) {
    const dates = days.every((d) => prefs.dates.includes(d))
    if (dates) participants = [...participants, 'me']
  }
  const n = participants.length
  const perPerson = perPersonFor(s.costs, n)

  let budgetFitCount = s.budgetFit.length
  let stayMissCount = s.stayMiss.length
  let topChoiceCount = s.topChoice.length
  let dateFitCount = s.baseParticipants.length
  let match = s.matchBase

  if (prefs) {
    const dates = participants.includes('me')
    const budget = budgetMaxOf(prefs) >= perPerson
    const rankIdx = prefs.destinations.indexOf(s.dest)
    const destRank = rankIdx === -1 ? 0 : rankIdx + 1
    const pace = prefs.pace === s.pace
    const stay = s.stayOk.includes(prefs.stay)
    const W = MATCH_WEIGHTS
    const parts: Record<MatchDimension, number> = {
      dates: dates ? W.dates : 0,
      budget: budget ? W.budget : 0,
      destination: Math.round(W.destination * (DEST_RANK_RATIO[destRank] ?? 0)),
      pace: pace ? W.pace : prefs.pace === 'balanced' || s.pace === 'balanced' ? Math.round(W.pace * PACE_ADJACENT_RATIO) : 0,
      stay: stay ? W.stay : 0,
    }
    const score = parts.dates + parts.budget + parts.destination + parts.pace + parts.stay
    myFit = { dates, budget, destRank, pace, stay, score, parts }
    if (budget) budgetFitCount += 1
    if (dates && !stay) stayMissCount += 1
    if (destRank === 1) topChoiceCount += 1
    if (dates) dateFitCount += 1
    match = Math.round((s.matchBase * 7 + score) / 8)
  }

  const filledCount = prefs ? 8 : 7
  const stats: SchemeStats = {
    participants,
    count: n,
    filledCount,
    perPerson,
    match,
    budgetFitCount,
    stayMissCount,
    topChoiceCount,
    dateFitCount,
    overlapDays: days.length,
    myFit,
    explanation: '',
  }
  stats.explanation = explain(s, stats)
  return stats
}

function explain(s: Scheme, st: SchemeStats) {
  const stay = st.stayMissCount === 0 ? '所有参加成员的住宿偏好都已满足。' : `仅${st.stayMissCount}人的住宿偏好未完全满足。`
  if (s.id === 'consensus') {
    return `${s.city}方案覆盖${st.count}/8人，所有成员日期有${st.overlapDays}天交集；整体预算符合${st.budgetFitCount}人的预期，${stay}`
  }
  if (s.id === 'budget') {
    return `${s.city}方案人均${yuan(st.perPerson)}，整体预算符合${st.budgetFitCount}人的预期；${st.count}/8人可参加，日期有${st.overlapDays}天交集，但1位同学因6月24日入职报到无法同行。`
  }
  const over = st.participants.length - s.baseParticipants.filter((id) => s.budgetFit.includes(id)).length - (st.myFit && st.participants.includes('me') && st.myFit.budget ? 1 : 0)
  return `${s.city}方案纪念感最强，${st.topChoiceCount}人把它排在第一；但6月18日出发与2位同学的离校手续冲突，仅${st.count}/8人可参加，人均${yuan(st.perPerson)}超出${over}位参加成员的预算上限。`
}

export function filledMembers(prefs: MyPrefs | null) {
  return MEMBERS.filter((m) => !m.isMe || prefs).length
}

/* ---------- 推荐与变化对比 ---------- */

export function computeAll(prefs: MyPrefs | null): Record<SchemeId, SchemeStats> {
  const out = {} as Record<SchemeId, SchemeStats>
  SCHEMES.forEach((s) => (out[s.id] = computeStats(s, prefs)))
  return out
}

/** 最佳方案：匹配度优先，其次参与人数多，再次人均更低 */
export function pickBest(stats: Record<SchemeId, SchemeStats>): SchemeId {
  return SCHEMES.map((s) => s.id).sort(
    (a, b) => stats[b].match - stats[a].match || stats[b].count - stats[a].count || stats[a].perPerson - stats[b].perPerson,
  )[0]
}

export interface RecommendationDelta {
  beforeSchemeId: SchemeId
  afterSchemeId: SchemeId
  beforeMatch: number
  afterMatch: number
  beforeCount: number
  afterCount: number
  beforePerPerson: number
  afterPerPerson: number
  lockedSchemeId: SchemeId | null
  isUpdate: boolean
  summary: string
  /** 三套方案匹配度前后对比 */
  rows: { id: SchemeId; before: number; after: number }[]
}

export function buildDelta(prevPrefs: MyPrefs | null, nextPrefs: MyPrefs, locked: SchemeId | null): RecommendationDelta {
  const before = computeAll(prevPrefs)
  const after = computeAll(nextPrefs)
  const beforeId = pickBest(before)
  const afterId = pickBest(after)
  const scheme = SCHEMES.find((s) => s.id === afterId)!
  const prevScheme = SCHEMES.find((s) => s.id === beforeId)!
  const a = after[afterId]
  const b = before[afterId]
  const fit = a.myFit!

  const endDay = rangeDays(scheme.start, scheme.end).length
  const range = `${fmtMD(scheme.start)}—${parseDate(scheme.end).getDate()}日`
  const dateClause = fit.dates ? `你的日期完整覆盖${range}` : `你的日期没有完整覆盖${range}（共${endDay}天），暂未计入参加人数`
  const budgetClause = fit.budget ? `预算也符合${scheme.city}方案` : `人均${yuan(a.perPerson)}略高于你的预算上限`
  const conclusion =
    beforeId === afterId
      ? `因此${scheme.city}仍是全员共识最强的选择。`
      : `综合匹配度${a.match}%超过了${prevScheme.city}，因此最佳方案变为${scheme.city}。`

  return {
    beforeSchemeId: beforeId,
    afterSchemeId: afterId,
    beforeMatch: b.match,
    afterMatch: a.match,
    beforeCount: b.count,
    afterCount: a.count,
    beforePerPerson: b.perPerson,
    afterPerPerson: a.perPerson,
    lockedSchemeId: locked,
    isUpdate: !!prevPrefs,
    summary: `因为${dateClause}，${budgetClause}，${conclusion}`,
    rows: SCHEMES.map((s) => ({ id: s.id, before: before[s.id].match, after: after[s.id].match })),
  }
}
