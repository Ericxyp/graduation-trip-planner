/**
 * 实际费用台账的纯函数：金额一律使用整数“分”，绝不使用浮点数参与计算。
 * 前后端共用：服务端负责权威计算，前端只用于输入解析与展示格式化。
 */

export const EXPENSE_CATEGORIES = [
  { id: 'transport', label: '交通' },
  { id: 'stay', label: '住宿' },
  { id: 'food', label: '餐饮' },
  { id: 'ticket', label: '门票/活动' },
  { id: 'local', label: '市内交通' },
  { id: 'other', label: '其他' },
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['id']
export const EXPENSE_CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id) as [ExpenseCategory, ...ExpenseCategory[]]
export const categoryLabel = (id: string) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? '其他'

export type SplitMethod = 'equal_all' | 'equal_selected' | 'custom'
export const MAX_EXPENSE_CENTS = 10_000_000 // ¥100,000

/** "186.5" / "¥1,234.56" → 18650 / 123456；格式非法返回 null。纯字符串解析，不经过浮点数 */
export function parseYuanToCents(input: string): number | null {
  const s = input.trim().replace(/^¥/, '').replace(/,/g, '')
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return null
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

/** 18650 → "¥186.50"；整数元省略小数："¥186" */
export function formatCents(cents: number, opts: { sign?: boolean; alwaysDecimals?: boolean } = {}): string {
  const neg = cents < 0
  const abs = Math.abs(cents)
  const yuan = Math.floor(abs / 100)
  const fen = abs % 100
  const body = `${yuan.toLocaleString('zh-CN')}${fen || opts.alwaysDecimals ? `.${String(fen).padStart(2, '0')}` : ''}`
  return `${neg ? '−' : opts.sign && cents > 0 ? '+' : ''}¥${body}`
}

/**
 * 均摊：base = ⌊总额 / 人数⌋，余下的 r 分按给定顺序依次分给前 r 人（每人至多多 1 分）。
 * 调用方需传入确定的顺序（例如按加入时间），保证同样输入总得到同样结果。
 */
export function splitEqual(amountCents: number, memberIds: string[]): Map<string, number> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('amount must be positive integer cents')
  if (!memberIds.length) throw new Error('no members to split')
  const n = memberIds.length
  const base = Math.floor(amountCents / n)
  const rest = amountCents - base * n
  return new Map(memberIds.map((id, i) => [id, base + (i < rest ? 1 : 0)]))
}

export interface LedgerExpense {
  id: string
  amountCents: number
  paidBy: string
  shares: { memberId: string; shareCents: number }[]
}

export interface Balance {
  memberId: string
  paidCents: number
  owedCents: number
  /** 正数：应收；负数：应补 */
  netCents: number
}

export function computeBalances(expenses: LedgerExpense[], memberOrder: string[]): Balance[] {
  const map = new Map<string, Balance>()
  const get = (id: string) => {
    let b = map.get(id)
    if (!b) map.set(id, (b = { memberId: id, paidCents: 0, owedCents: 0, netCents: 0 }))
    return b
  }
  memberOrder.forEach(get)
  for (const e of expenses) {
    get(e.paidBy).paidCents += e.amountCents
    for (const s of e.shares) get(s.memberId).owedCents += s.shareCents
  }
  for (const b of map.values()) b.netCents = b.paidCents - b.owedCents
  return [...map.values()]
}

export interface Transfer {
  from: string
  to: string
  cents: number
}

/**
 * 最少转账建议（贪心）：每次让“应补最多的人”向“应收最多的人”转账，金额取两者较小值。
 * 每一步至少结清一人，因此转账笔数 ≤ 有余额人数 − 1；平局按 id 排序，结果确定。
 * 输入的 net 之和必须为 0（每笔费用的分摊总额等于费用金额，服务端已保证）。
 */
export function minTransfers(balances: Pick<Balance, 'memberId' | 'netCents'>[]): Transfer[] {
  const creditors = balances.filter((b) => b.netCents > 0).map((b) => ({ id: b.memberId, left: b.netCents }))
  const debtors = balances.filter((b) => b.netCents < 0).map((b) => ({ id: b.memberId, left: -b.netCents }))
  const sum = creditors.reduce((s, c) => s + c.left, 0) - debtors.reduce((s, d) => s + d.left, 0)
  if (sum !== 0) throw new Error('balances do not sum to zero')
  const order = (a: { id: string; left: number }, b: { id: string; left: number }) => b.left - a.left || a.id.localeCompare(b.id)
  const out: Transfer[] = []
  for (;;) {
    creditors.sort(order)
    debtors.sort(order)
    const c = creditors.find((x) => x.left > 0)
    const d = debtors.find((x) => x.left > 0)
    if (!c || !d) break
    const amt = Math.min(c.left, d.left)
    out.push({ from: d.id, to: c.id, cents: amt })
    c.left -= amt
    d.left -= amt
  }
  return out
}
