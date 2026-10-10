/**
 * 云端旅行局的前后端共享类型（API 契约）。
 * 只包含可以安全返回给客户端的结构：不出现任何 token 哈希、邀请码哈希或他人原始偏好。
 */
import type { Pace, StayPref } from './options.js'
import type { MatchDimension } from './weights.js'

export type Role = 'organizer' | 'member'
export type TripStatus = 'collecting' | 'locked' | 'archived'
export type PlanKind = 'consensus' | 'budget' | 'memorable'

export interface Preferences {
  dates: string[]
  budgetId: string
  destinations: string[]
  pace: Pace
  stay: StayPref
  musts: string[]
  nos: string[]
}

export interface PublicTrip {
  slug: string
  name: string
  organizerName: string
  originCity: string
  candidateDestinations: string[]
  dateStart: string
  dateEnd: string
  memberLimit: number
  memberCount: number
  inviteDeadline: string | null
  inviteExpired: boolean
  isFull: boolean
  status: TripStatus
  createdAt: string
  /** 阶段三：邀请状态（open 开放 / paused 已暂停 / expired 已过期 / full 人数已满 / closed 已解散） */
  inviteStatus: InviteStatus
}

export type InviteStatus = 'open' | 'paused' | 'expired' | 'full' | 'closed'

export interface Identity {
  memberId: string
  memberToken: string
  role: Role
}

export interface MemberSummary {
  id: string
  displayName: string
  role: Role
  color: string
  hasPreferences: boolean
  joinedAt: string
}

export interface CostLine {
  key: 'transport' | 'stay' | 'food' | 'ticket' | 'local' | 'reserve'
  label: string
  note: string
  perPerson: number
  shared: boolean
}

export interface ItineraryItemView {
  key: string
  time: string
  place: string
  activity: string
  cost: number
  ownerId: string
  ownerName: string
}

export interface ItineraryDayView {
  date: string
  title: string
  items: ItineraryItemView[]
}

export interface ConflictView {
  title: string
  detail: string
  level: 'high' | 'mid' | 'low'
}

export interface PlanDims {
  filled: number
  dateFit: number
  budgetFit: number
  topChoice: number
  paceFit: number
  stayFit: number
  vetoed: number
  mustUnmet: number
}

export interface MyPlanFit {
  participating: boolean
  dates: boolean
  budget: boolean
  destRank: number
  pace: boolean
  stay: boolean
  vetoed: boolean
  parts: Record<MatchDimension, number>
  score: number
}

export interface PlanView {
  id: string
  kind: PlanKind
  label: string
  slogan: string
  destination: string
  dateStart: string
  dateEnd: string
  days: number
  pace: Pace
  stayType: Exclude<StayPref, 'any'>
  stayLabel: string
  participants: { id: string; displayName: string }[]
  participantCount: number
  memberCount: number
  feasible: boolean
  perPerson: number
  costs: CostLine[]
  costEstimated: boolean
  match: number
  dims: PlanDims
  tags: string[]
  conflicts: ConflictView[]
  reasons: string[]
  explanation: string
  itinerary: ItineraryDayView[]
  myFit: MyPlanFit | null
}

export interface ConsensusView {
  status: 'ready' | 'need_more'
  filledCount: number
  memberCount: number
  plans: PlanView[]
  generatedAt: string
}

export interface SharedState {
  selectedPlanId: string | null
  lockedPlanId: string | null
  tasks: Record<string, boolean>
  paidMembers: string[]
  exitedMembers: string[]
  version: number
  updatedAt: string
}

export interface TripView {
  trip: PublicTrip
  me: {
    memberId: string
    displayName: string
    role: Role
    preferences: Preferences | null
  }
  members: MemberSummary[]
  filledCount: number
  consensus: ConsensusView
  lockedPlan: PlanView | null
  state: SharedState
  /** 单调递增，用于丢弃过期的轮询响应 */
  revision: number
  serverTime: string
  /** 阶段三：仅发起人可见的管理信息 */
  admin: { inviteVersion: number; invitePaused: boolean; hasRecoveryCode: boolean } | null
  ledger: LedgerView
  activity: ActivityView[]
}

export interface ExpenseView {
  id: string
  title: string
  category: string
  amountCents: number
  paidBy: { id: string; displayName: string; left: boolean }
  splitMethod: 'equal_all' | 'equal_selected' | 'custom'
  shares: { memberId: string; displayName: string; shareCents: number }[]
  createdBy: string
  createdAt: string
  version: number
  canEdit: boolean
}

export interface LedgerView {
  enabled: boolean
  totalCents: number
  expenses: ExpenseView[]
  balances: { memberId: string; displayName: string; left: boolean; paidCents: number; owedCents: number; netCents: number }[]
  transfers: { from: string; fromName: string; to: string; toName: string; cents: number }[]
}

export interface ActivityView {
  id: number
  type: string
  text: string
  at: string
  /** 成员退出事件附带的重算结果，用于其他成员看到变化反馈 */
  leave?: LeaveSummary
}

export interface LeaveSummary {
  name: string
  countBefore: number
  countAfter: number
  perPersonBefore: number
  perPersonAfter: number
  reassigned: number
  lockedDestination: string | null
  planDestination: string | null
}

export interface LeaveResult {
  status: 'left' | 'already_left'
  summary: LeaveSummary | null
}

export interface CreateTripInput {
  name: string
  originCity: string
  candidateDestinations: string[]
  dateStart: string
  dateEnd: string
  memberLimit: number
  organizerName: string
  inviteDeadline?: string | null
}

export interface CreateTripResult {
  trip: PublicTrip
  identity: Identity & { role: 'organizer' }
  invite: { code: string; url: string }
  /** 阶段三：发起人恢复码，只在此响应中出现一次 */
  recovery: { code: string }
}

export interface JoinTripResult {
  trip: PublicTrip
  identity: Identity
}

export type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TRIP_NOT_FOUND'
  | 'MEMBER_NOT_FOUND'
  | 'INVALID_INVITE_CODE'
  | 'INVITE_EXPIRED'
  | 'MEMBER_LIMIT_REACHED'
  | 'DISPLAY_NAME_TAKEN'
  | 'VERSION_CONFLICT'
  | 'PLAN_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NOT_CONFIGURED'
  | 'DATABASE_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'INVITE_PAUSED'
  | 'TRIP_ARCHIVED'
  | 'MEMBER_LEFT'
  | 'ORGANIZER_CANNOT_LEAVE'
  | 'INVALID_RECOVERY_CODE'
  | 'EXPENSE_NOT_FOUND'
  | 'NOT_LOCKED'
  | 'INTERNAL_ERROR'

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string }
}

export interface HealthView {
  status: 'ok' | 'not_configured' | 'degraded'
  database: 'ok' | 'not_configured' | 'unreachable'
  pepper: 'configured' | 'missing'
  time: string
}
