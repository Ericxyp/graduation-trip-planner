import { BUDGET_OPTIONS, MEMBERS } from './data'
import type { CostItem, MemberId, MyPrefs, Scheme } from './types'

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
    const destScore = destRank === 1 ? 20 : destRank === 2 ? 14 : destRank === 3 ? 8 : 0
    const paceScore = pace ? 10 : prefs.pace === 'balanced' || s.pace === 'balanced' ? 6 : 0
    const score = (dates ? 40 : 0) + (budget ? 20 : 0) + destScore + paceScore + (stay ? 10 : 0)
    myFit = { dates, budget, destRank, pace, stay, score }
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
