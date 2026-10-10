/**
 * 旅行局动态：事件只保存脱敏后的摘要字段（昵称、城市、标题、金额、计数），
 * 这里把它们渲染成面向普通用户的一句话。绝不出现偏好原文、token、邀请码或恢复码。
 */
import { formatCents } from './ledger.js'
import type { LeaveSummary } from './types.js'

export type ActivityType =
  | 'trip_created'
  | 'member_joined'
  | 'prefs_submitted'
  | 'prefs_updated'
  | 'plan_locked'
  | 'plan_unlocked'
  | 'invite_regenerated'
  | 'invite_paused'
  | 'invite_resumed'
  | 'invite_deadline'
  | 'member_left'
  | 'member_removed'
  | 'task_done'
  | 'task_reopened'
  | 'expense_added'
  | 'expense_updated'
  | 'expense_deleted'
  | 'paid_marked'
  | 'paid_unmarked'
  | 'organizer_recovered'
  | 'organizer_transferred'
  | 'recovery_code_reset'
  | 'trip_archived'

/** 每种事件允许保存的字段白名单；写入前会按白名单过滤 */
export const ACTIVITY_FIELDS: Record<ActivityType, string[]> = {
  trip_created: ['actor', 'name'],
  member_joined: ['actor'],
  prefs_submitted: ['actor'],
  prefs_updated: ['actor'],
  plan_locked: ['actor', 'destination'],
  plan_unlocked: ['actor'],
  invite_regenerated: ['actor'],
  invite_paused: ['actor'],
  invite_resumed: ['actor'],
  invite_deadline: ['actor', 'deadline'],
  member_left: ['actor', 'leave'],
  member_removed: ['actor', 'target'],
  task_done: ['actor', 'title'],
  task_reopened: ['actor', 'title'],
  expense_added: ['actor', 'title', 'cents'],
  expense_updated: ['actor', 'title', 'cents'],
  expense_deleted: ['actor', 'title', 'cents'],
  paid_marked: ['actor'],
  paid_unmarked: ['actor'],
  organizer_recovered: ['actor'],
  organizer_transferred: ['actor', 'target'],
  recovery_code_reset: ['actor'],
  trip_archived: ['actor'],
}

export function sanitizePayload(type: ActivityType, payload: Record<string, unknown>): Record<string, unknown> {
  const allowed = ACTIVITY_FIELDS[type]
  return Object.fromEntries(Object.entries(payload).filter(([k]) => allowed.includes(k)))
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function activityText(type: string, p: Record<string, unknown>): string {
  const a = str(p.actor) || '有人'
  switch (type as ActivityType) {
    case 'trip_created':
      return `${a}创建了旅行局「${str(p.name)}」`
    case 'member_joined':
      return `${a}加入了旅行局`
    case 'prefs_submitted':
      return `${a}提交了偏好`
    case 'prefs_updated':
      return `${a}修改了偏好`
    case 'plan_locked':
      return `${a}锁定了${str(p.destination)}方案`
    case 'plan_unlocked':
      return `${a}取消了方案锁定`
    case 'invite_regenerated':
      return `${a}更新了邀请码，旧邀请码已失效`
    case 'invite_paused':
      return `${a}暂停了邀请`
    case 'invite_resumed':
      return `${a}恢复了邀请`
    case 'invite_deadline':
      return p.deadline ? `${a}更新了邀请截止时间` : `${a}取消了邀请截止时间`
    case 'member_left':
      return `${a}退出了旅行局`
    case 'member_removed':
      return `${a}将${str(p.target)}移出了旅行局`
    case 'task_done':
      return `${a}完成了任务「${str(p.title)}」`
    case 'task_reopened':
      return `${a}把任务「${str(p.title)}」改回待办`
    case 'expense_added':
      return `${a}新增费用“${str(p.title)} ${formatCents(Number(p.cents) || 0)}”`
    case 'expense_updated':
      return `${a}修改了费用“${str(p.title)} ${formatCents(Number(p.cents) || 0)}”`
    case 'expense_deleted':
      return `${a}删除了费用“${str(p.title)}”`
    case 'paid_marked':
      return `${a}标记自己已付款`
    case 'paid_unmarked':
      return `${a}撤销了付款标记`
    case 'organizer_recovered':
      return `${a}在新设备上恢复了发起人身份`
    case 'organizer_transferred':
      return `${a}把发起人身份转让给了${str(p.target)}`
    case 'recovery_code_reset':
      return `${a}重新生成了发起人恢复码`
    case 'trip_archived':
      return `${a}解散了旅行局`
    default:
      return '旅行局有新的动态'
  }
}

export function leaveOf(p: Record<string, unknown>): LeaveSummary | undefined {
  const l = p.leave as LeaveSummary | undefined
  return l && typeof l === 'object' ? l : undefined
}
