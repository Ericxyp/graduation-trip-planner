export type MemberId = 'lin' | 'zhe' | 'tang' | 'peng' | 'lu' | 'yiyi' | 'k' | 'me'

export interface Member {
  id: MemberId
  name: string
  school: string
  color: string // avatar bg
  isOrganizer?: boolean
  isMe?: boolean
  filledAt?: string
}

import type { Pace, StayPref } from './shared/options'
export type { Pace, StayPref }
export type DestId = 'chengdu' | 'qingdao' | 'changsha'

export interface MyPrefs {
  dates: string[] // 'YYYY-MM-DD'
  budget: string // budget option id
  destinations: string[] // ordered（演示模式为城市 id，云端为城市名）
  pace: Pace
  stay: StayPref
  musts: string[]
  nos: string[]
  submittedAt: string
}

export type SchemeId = 'consensus' | 'budget' | 'memorable'

export interface CostItem {
  key: 'transport' | 'stay' | 'food' | 'ticket' | 'local' | 'reserve'
  label: string
  note: string
  personal: number // 每人固定部分
  shared: number // 全队共摊总额
}

export interface ItineraryItem {
  time: string
  place: string
  activity: string
  cost: number // 人均
  owner: MemberId
}

export interface ItineraryDay {
  title: string
  items: ItineraryItem[]
}

export interface Conflict {
  title: string
  detail: string
  level: 'high' | 'mid' | 'low'
}

export interface Scheme {
  id: SchemeId
  label: string
  slogan: string
  dest: DestId
  city: string
  cityCode: string
  start: string
  end: string
  baseParticipants: MemberId[]
  budgetFit: MemberId[] // 已填写成员中预算可接受者
  stayMiss: MemberId[] // 住宿偏好未满足的参与者
  topChoice: MemberId[] // 把该城市排第一的成员
  matchBase: number
  pace: Pace
  stayLabel: string
  stayOk: StayPref[]
  tags: string[]
  conflicts: Conflict[]
  reasons: string[]
  aiTip: { headline: string; before: string; after: string; status: string }
  costs: CostItem[]
  itinerary: ItineraryDay[]
}

export interface AppState {
  version: number
  myPrefs: MyPrefs | null
  selected: SchemeId
  locked: SchemeId | null
  tasks: Record<string, boolean>
  exited: Record<SchemeId, MemberId[]>
  paid: Record<SchemeId, MemberId[]>
}
