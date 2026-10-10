/**
 * 前后端共享的偏好选项。演示模式（src/data.ts）与云端模式（server/）都从这里读取，
 * 保证选项 id 与规则引擎一致。此文件不得引入任何浏览器或服务端专属依赖。
 */
export type Pace = 'rush' | 'balanced' | 'relax'
export type StayPref = 'any' | 'homestay' | 'hotel' | 'private-bath'

export const BUDGET_OPTIONS = [
  { id: 'b1', label: '2000 以内', min: 0, max: 2000 },
  { id: 'b2', label: '2000–2500', min: 2000, max: 2500 },
  { id: 'b3', label: '2500–3000', min: 2500, max: 3000 },
  { id: 'b4', label: '3000–3500', min: 3000, max: 3500 },
  { id: 'b5', label: '3500 以上', min: 3500, max: 99999 },
] as const

export type BudgetId = (typeof BUDGET_OPTIONS)[number]['id']
export const BUDGET_IDS = BUDGET_OPTIONS.map((b) => b.id) as [BudgetId, ...BudgetId[]]

export const PACE_OPTIONS: { id: Pace; label: string; desc: string }[] = [
  { id: 'rush', label: '特种兵', desc: '一天三个点，体力拉满' },
  { id: 'balanced', label: '适中', desc: '有安排，也留时间发呆' },
  { id: 'relax', label: '度假', desc: '睡到自然醒，随走随停' },
]

export const STAY_OPTIONS: { id: StayPref; label: string }[] = [
  { id: 'any', label: '不挑，干净安全就行' },
  { id: 'homestay', label: '整租民宿，大家住一起' },
  { id: 'hotel', label: '连锁酒店，两人一间' },
  { id: 'private-bath', label: '必须有独立卫浴' },
]

export const MUST_OPTIONS = ['要有毕业合影/跟拍', '能吃到地道本地菜', '每天睡够7小时', '单程交通5小时内', '有山或海的风景']
export const NO_OPTIONS = ['早于7点集合', '红眼航班或夜车', '一天暴走超过2万步', '35°C以上高温暴晒', '6人以上混住一间']

export const PACE_LABEL: Record<Pace, string> = { rush: '特种兵', balanced: '适中', relax: '度假' }

export function budgetMax(id: string): number {
  return BUDGET_OPTIONS.find((b) => b.id === id)?.max ?? 0
}
