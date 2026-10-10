/**
 * 匹配度权重（总和 100）。演示模式的 computeStats、云端规则引擎与界面说明共用此常量。
 */
export const MATCH_WEIGHTS = {
  dates: 40,
  budget: 20,
  destination: 20,
  pace: 10,
  stay: 10,
} as const

export type MatchDimension = keyof typeof MATCH_WEIGHTS

export const MATCH_DIMENSIONS: { key: MatchDimension; label: string; rule: string }[] = [
  { key: 'dates', label: '日期匹配', rule: '可出发日期完整覆盖方案日期得满分，否则为 0' },
  { key: 'budget', label: '预算匹配', rule: '预算上限不低于方案人均得满分，否则为 0' },
  { key: 'destination', label: '目的地偏好', rule: '按志愿顺序递减：第一志愿 100%、第二 70%、第三 40%' },
  { key: 'pace', label: '旅行节奏', rule: '节奏一致得满分；一方为“适中”得 60%；特种兵与度假相反为 0' },
  { key: 'stay', label: '住宿要求', rule: '方案住宿类型满足你的要求得满分，否则为 0' },
]

/** 目的地志愿顺序对应的得分比例（第 4、5 志愿用于云端 2–5 个候选地） */
export const DEST_RANK_RATIO: Record<number, number> = { 1: 1, 2: 0.7, 3: 0.4, 4: 0.2, 5: 0.1 }
/** 节奏相邻（任一方为“适中”）时的得分比例 */
export const PACE_ADJACENT_RATIO = 0.6

export const WEIGHT_TOTAL = Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0)
