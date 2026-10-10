/**
 * 进程内滑动窗口限流。适合雏形：每个函数实例各自计数，不是多实例强一致限流。
 * 生产化应替换为 Upstash Redis / Vercel KV 等共享存储。
 */
const buckets = new Map<string, number[]>()

export function hitRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (list.length >= limit) {
    buckets.set(key, list)
    return true
  }
  list.push(now)
  buckets.set(key, list)
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k)
  }
  return false
}

export function resetRateLimits() {
  buckets.clear()
}
