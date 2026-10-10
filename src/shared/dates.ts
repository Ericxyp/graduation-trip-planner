/** 纯字符串日期工具（YYYY-MM-DD，按 UTC 计算，避免时区漂移） */
export function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function rangeDays(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  while (cur <= end && out.length < 400) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function fmtMonthDay(s: string): string {
  const [, m, d] = s.split('-').map(Number)
  return `${m}月${d}日`
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export function weekdayOf(s: string): string {
  return WEEK[new Date(`${s}T00:00:00Z`).getUTCDay()]
}
