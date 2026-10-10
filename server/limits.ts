/**
 * 持久化限流（存 Postgres，跨 Vercel 实例生效）。
 * - bucket_key = HMAC(pepper, scope + 标识)，表中不出现原始 IP、token、邀请码或恢复码；
 * - 固定窗口计数，超限返回 429 + Retry-After；
 * - 过期记录在约 2% 的请求中顺带清理（DELETE ... WHERE expires_at < now() - 1h）。
 */
import { createHmac } from 'node:crypto'
import type { Db } from './db.js'
import { ApiError } from './errors.js'

export interface LimitRule {
  scope: string
  limit: number
  windowSec: number
  message: string
}

export const LIMITS = {
  createPerIp: { scope: 'create:ip', limit: 10, windowSec: 600, message: '创建太频繁，请稍后再试' },
  joinPerIpTrip: { scope: 'join:ip-trip', limit: 10, windowSec: 600, message: '加入尝试次数过多，请稍后再试' },
  joinPerTrip: { scope: 'join:trip', limit: 60, windowSec: 600, message: '该旅行局加入尝试过多，请稍后再试' },
  recoverPerIpTrip: { scope: 'recover:ip-trip', limit: 5, windowSec: 900, message: '恢复尝试次数过多，请 15 分钟后再试' },
  recoverPerTrip: { scope: 'recover:trip', limit: 20, windowSec: 3600, message: '该旅行局恢复尝试过多，请 1 小时后再试' },
  inviteRegenerate: { scope: 'invite:regen', limit: 10, windowSec: 3600, message: '邀请码更新太频繁，请稍后再试' },
} satisfies Record<string, LimitRule>

export function bucketKey(pepper: string, scope: string, id: string): string {
  return createHmac('sha256', `ratelimit:${pepper}`).update(`${scope}\u0000${id}`).digest('hex')
}

export async function enforceLimit(db: Db, pepper: string, rule: LimitRule, id: string): Promise<void> {
  const key = bucketKey(pepper, rule.scope, id)
  const rows = await db.query<{ count: number; retry_after: number }>(
    `INSERT INTO rate_limits (bucket_key, count, window_start, expires_at)
     VALUES ($1, 1, now(), now() + make_interval(secs => $2::int))
     ON CONFLICT (bucket_key) DO UPDATE SET
       count = CASE WHEN rate_limits.expires_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.expires_at <= now() THEN now() ELSE rate_limits.window_start END,
       expires_at = CASE WHEN rate_limits.expires_at <= now() THEN now() + make_interval(secs => $2::int) ELSE rate_limits.expires_at END
     RETURNING count, GREATEST(1, ceil(extract(epoch FROM (expires_at - now()))))::int AS retry_after`,
    [key, rule.windowSec],
  )
  if (Math.random() < 0.02) db.query(`DELETE FROM rate_limits WHERE expires_at < now() - interval '1 hour' RETURNING bucket_key`).catch(() => {})
  const r = rows[0]
  if (r && Number(r.count) > rule.limit) {
    const e = new ApiError('RATE_LIMITED', rule.message)
    e.retryAfter = Number(r.retry_after)
    throw e
  }
}
