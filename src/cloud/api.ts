/** 浏览器端 API 客户端：只调用同源 /api/*，不接触任何数据库或密钥 */
import type { ApiErrorCode, CreateTripInput, CreateTripResult, HealthView, JoinTripResult, LeaveResult, Preferences, PublicTrip, TripView } from '../shared/types'

export class ApiClientError extends Error {
  code: ApiErrorCode | 'NETWORK' | 'BAD_RESPONSE'
  status: number
  constructor(code: ApiClientError['code'], message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

const FRIENDLY: Partial<Record<ApiClientError['code'], string>> = {
  NETWORK: '网络连接失败，请检查网络后重试',
  BAD_RESPONSE: '云端服务暂不可用（本地 vite dev 不包含 API，请使用 vercel dev）',
  NOT_CONFIGURED: '云端功能尚未配置',
  DATABASE_UNAVAILABLE: '数据库暂时不可用，请稍后重试',
  RATE_LIMITED: '操作太频繁，请稍后再试',
}

async function request<T>(method: string, path: string, opts: { body?: unknown; token?: string; timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000)
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new ApiClientError('NETWORK', FRIENDLY.NETWORK!, 0)
  } finally {
    window.clearTimeout(timer)
  }
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new ApiClientError('BAD_RESPONSE', FRIENDLY.BAD_RESPONSE!, res.status)
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: ApiErrorCode; message?: string } })?.error
    const code = err?.code ?? 'INTERNAL_ERROR'
    throw new ApiClientError(code, err?.message || FRIENDLY[code] || '请求失败，请稍后重试', res.status)
  }
  return data as T
}

export const api = {
  healthRaw: async (): Promise<HealthView | null> => {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      return (await res.json()) as HealthView
    } catch {
      return null
    }
  },
  createTrip: (input: CreateTripInput) => request<CreateTripResult>('POST', '/trips', { body: input }),
  getPublic: (slug: string) => request<{ trip: PublicTrip }>('GET', `/trips/${slug}/public`),
  join: (slug: string, displayName: string, inviteCode: string) => request<JoinTripResult>('POST', `/trips/${slug}/join`, { body: { displayName, inviteCode } }),
  getTrip: (slug: string, token: string) => request<TripView>('GET', `/trips/${slug}`, { token }),
  putPreferences: (slug: string, token: string, p: Preferences) => request<TripView>('PUT', `/trips/${slug}/preferences/me`, { token, body: p }),
  lock: (slug: string, token: string, planId: string | null, expectedVersion: number) => request<TripView>('POST', `/trips/${slug}/lock`, { token, body: { planId, expectedVersion } }),
  setTask: (slug: string, token: string, key: string, done: boolean, expectedVersion: number) => request<TripView>('PATCH', `/trips/${slug}/state`, { token, body: { op: 'task', key, done, expectedVersion } }),
  setPaid: (slug: string, token: string, paid: boolean, expectedVersion: number) => request<TripView>('PATCH', `/trips/${slug}/state`, { token, body: { op: 'paid', paid, expectedVersion } }),
  removeMember: (slug: string, token: string, memberId: string) => request<TripView>('DELETE', `/trips/${slug}/members/${memberId}`, { token }),
  /* 阶段三 */
  leave: (slug: string, token: string) => request<LeaveResult>('POST', `/trips/${slug}/leave`, { token, body: {} }),
  transferOrganizer: (slug: string, token: string, memberId: string) => request<TripView>('POST', `/trips/${slug}/transfer-organizer`, { token, body: { memberId } }),
  archive: (slug: string, token: string) => request<TripView>('POST', `/trips/${slug}/archive`, { token, body: {} }),
  /** 恢复码只放在请求体里，绝不放进 URL */
  recoverOrganizer: (slug: string, recoveryCode: string) => request<JoinTripResult>('POST', `/trips/${slug}/recover-organizer`, { body: { recoveryCode } }),
  resetRecoveryCode: (slug: string, token: string) => request<{ recovery: { code: string } }>('POST', `/trips/${slug}/recovery-code`, { token, body: {} }),
  updateInvite: (slug: string, token: string, body: InviteAction) => request<{ view: TripView; invite: { code: string; url: string } | null }>('PATCH', `/trips/${slug}/invite`, { token, body }),
  createExpense: (slug: string, token: string, body: ExpenseInput) => request<TripView>('POST', `/trips/${slug}/expenses`, { token, body }),
  updateExpense: (slug: string, token: string, id: string, body: ExpenseInput & { expectedVersion: number }) => request<TripView>('PATCH', `/trips/${slug}/expenses/${id}`, { token, body }),
  deleteExpense: (slug: string, token: string, id: string, expectedVersion: number) => request<TripView>('DELETE', `/trips/${slug}/expenses/${id}`, { token, body: { expectedVersion } }),
}

export type InviteAction =
  | { action: 'regenerate' | 'pause' | 'resume'; expectedInviteVersion: number }
  | { action: 'deadline'; inviteDeadline: string | null; expectedInviteVersion: number }

export interface ExpenseInput {
  title: string
  category: string
  amountCents: number
  paidBy: string
  split: { splitMethod: 'equal_all' } | { splitMethod: 'equal_selected'; memberIds: string[] } | { splitMethod: 'custom'; shares: { memberId: string; shareCents: number }[] }
}
