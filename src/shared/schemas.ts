/**
 * API 输入校验（zod）。仅由服务端（server/）引用，前端不导入此文件，避免把 zod 打进浏览器包。
 */
import { z } from 'zod'
import { isIsoDate, rangeDays } from './dates.js'
import { BUDGET_IDS, MUST_OPTIONS, NO_OPTIONS } from './options.js'
import { EXPENSE_CATEGORY_IDS, MAX_EXPENSE_CENTS } from './ledger.js'

const text = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(min).max(max))

const cityName = text(1, 20).refine((s) => !/[|@/#~<>]/.test(s), '城市名包含不支持的字符')
const isoDate = z.string().refine(isIsoDate, '日期格式应为 YYYY-MM-DD')

export const createTripSchema = z
  .object({
    name: text(2, 40),
    originCity: cityName,
    candidateDestinations: z.array(cityName).min(2).max(5),
    dateStart: isoDate,
    dateEnd: isoDate,
    memberLimit: z.number().int().min(2).max(30),
    organizerName: text(1, 16),
    inviteDeadline: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.candidateDestinations).size !== v.candidateDestinations.length) ctx.addIssue({ code: 'custom', message: '候选目的地不能重复', path: ['candidateDestinations'] })
    if (v.dateEnd < v.dateStart) ctx.addIssue({ code: 'custom', message: '结束日期不能早于开始日期', path: ['dateEnd'] })
    else if (rangeDays(v.dateStart, v.dateEnd).length > 30) ctx.addIssue({ code: 'custom', message: '日期范围最长 30 天', path: ['dateEnd'] })
  })

export const joinTripSchema = z
  .object({
    displayName: text(1, 16),
    inviteCode: z
      .string()
      .transform((s) => s.trim().toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9]{6,12}$/, '邀请码格式不正确')),
  })
  .strict()

export const preferencesSchema = z
  .object({
    dates: z.array(isoDate).min(1).max(31),
    budgetId: z.enum(BUDGET_IDS),
    destinations: z.array(cityName).min(1).max(5),
    pace: z.enum(['rush', 'balanced', 'relax']),
    stay: z.enum(['any', 'homestay', 'hotel', 'private-bath']),
    musts: z.array(z.enum(MUST_OPTIONS as [string, ...string[]])).max(MUST_OPTIONS.length),
    nos: z.array(z.enum(NO_OPTIONS as [string, ...string[]])).max(NO_OPTIONS.length),
  })
  .strict()

export const lockSchema = z
  .object({
    planId: z.string().min(1).max(64).nullable(),
    expectedVersion: z.number().int().min(0),
  })
  .strict()

export const statePatchSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('task'), key: z.string().min(1).max(96), done: z.boolean(), expectedVersion: z.number().int().min(0) }).strict(),
  z.object({ op: z.literal('paid'), paid: z.boolean(), expectedVersion: z.number().int().min(0) }).strict(),
])

export type CreateTripBody = z.infer<typeof createTripSchema>
export type JoinTripBody = z.infer<typeof joinTripSchema>
export type PreferencesBody = z.infer<typeof preferencesSchema>
export type LockBody = z.infer<typeof lockSchema>
export type StatePatchBody = z.infer<typeof statePatchSchema>

/* ---------------- 阶段三 ---------------- */

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'ID 格式不正确')
const cents = z.number().int('金额必须是整数分').min(1).max(MAX_EXPENSE_CENTS)

export const leaveSchema = z.object({}).strict()

export const recoverSchema = z
  .object({
    recoveryCode: z
      .string()
      .transform((s) => s.replace(/[\s-]/g, '').toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9]{16}$/, '恢复码格式不正确')),
  })
  .strict()

export const transferSchema = z.object({ memberId: uuid }).strict()

export const inviteSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('regenerate'), expectedInviteVersion: z.number().int().min(0) }).strict(),
  z.object({ action: z.literal('pause'), expectedInviteVersion: z.number().int().min(0) }).strict(),
  z.object({ action: z.literal('resume'), expectedInviteVersion: z.number().int().min(0) }).strict(),
  z.object({ action: z.literal('deadline'), inviteDeadline: z.string().datetime({ offset: true }).nullable(), expectedInviteVersion: z.number().int().min(0) }).strict(),
])

const expenseBase = {
  title: text(1, 40),
  category: z.enum(EXPENSE_CATEGORY_IDS),
  amountCents: cents,
  paidBy: uuid,
}
const splitSchema = z.discriminatedUnion('splitMethod', [
  z.object({ splitMethod: z.literal('equal_all') }).strict(),
  z.object({ splitMethod: z.literal('equal_selected'), memberIds: z.array(uuid).min(1).max(30) }).strict(),
  z
    .object({
      splitMethod: z.literal('custom'),
      shares: z.array(z.object({ memberId: uuid, shareCents: z.number().int().min(0).max(MAX_EXPENSE_CENTS) }).strict()).min(1).max(30),
    })
    .strict(),
])

export const expenseCreateSchema = z.object({ ...expenseBase, split: splitSchema }).strict()
export const expenseUpdateSchema = z.object({ ...expenseBase, split: splitSchema, expectedVersion: z.number().int().min(0) }).strict()
export const expenseDeleteSchema = z.object({ expectedVersion: z.number().int().min(0) }).strict()

export type InviteBody = z.infer<typeof inviteSchema>
export type ExpenseCreateBody = z.infer<typeof expenseCreateSchema>
export type ExpenseUpdateBody = z.infer<typeof expenseUpdateSchema>
export type RecoverBody = z.infer<typeof recoverSchema>
