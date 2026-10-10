/**
 * API 路由：Web 标准 Request → Response。
 * Vercel Functions（api/[...route].ts 等）与测试都直接调用 handleApi，不依赖 Express。
 */
import type { ZodType } from 'zod'
import {
  createTripSchema,
  expenseCreateSchema,
  expenseDeleteSchema,
  expenseUpdateSchema,
  inviteSchema,
  joinTripSchema,
  leaveSchema,
  lockSchema,
  preferencesSchema,
  recoverSchema,
  statePatchSchema,
  transferSchema,
} from '../src/shared/schemas.js'
import type { ApiErrorBody, HealthView } from '../src/shared/types.js'
import type { ServerConfig } from './config.js'
import { pgCode, type Db } from './db.js'
import { ApiError } from './errors.js'
import { hitRateLimit } from './rateLimit.js'
import { createRepo } from './repo.js'
import { createService } from './service.js'

export const MAX_BODY_BYTES = 16 * 1024

const SECURITY_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
}

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, ...extra } })
}

function errorResponse(e: ApiError): Response {
  const body: ApiErrorBody = { error: { code: e.code, message: e.message } }
  return json(e.status, body, e.code === 'RATE_LIMITED' ? { 'retry-after': String(e.retryAfter ?? 60) } : {})
}

async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const ct = req.headers.get('content-type') ?? ''
  if (!ct.toLowerCase().startsWith('application/json')) throw new ApiError('INVALID_INPUT', '请求体必须是 JSON', 415)
  const len = Number(req.headers.get('content-length') ?? '0')
  if (len > MAX_BODY_BYTES) throw new ApiError('INVALID_INPUT', '请求体过大', 413)
  const raw = await req.text()
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new ApiError('INVALID_INPUT', '请求体过大', 413)
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new ApiError('INVALID_INPUT', '请求体不是合法 JSON')
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path.join('.') || '请求'
    throw new ApiError('INVALID_INPUT', `${field}：${issue?.message ?? '格式不正确'}`)
  }
  return parsed.data
}

/** 允许空请求体（例如退出）；有内容时按同样规则校验 */
async function readOptionalJson<T>(req: Request, schema: ZodType<T>): Promise<T | null> {
  const len = Number(req.headers.get('content-length') ?? '0')
  if (!req.headers.get('content-type') && !len) return null
  return readJson(req, schema)
}

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(\S+)$/i.exec(h)
  return m ? m[1] : null
}

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

/** 解析对外路径：兼容 rewrite 传入的 ?__path= 与直接访问 */
export function apiPath(req: Request): string {
  const url = new URL(req.url)
  const viaRewrite = url.searchParams.get('__path')
  const path = viaRewrite !== null ? `/api/${viaRewrite}` : url.pathname
  return path.replace(/\/+$/, '') || '/'
}

export interface ApiDeps {
  config: ServerConfig
  /** 数据库工厂：仅在配置了 DATABASE_URL 时调用 */
  db: (url: string) => Db
}

export async function health(deps: ApiDeps): Promise<Response> {
  const base = { pepper: deps.config.pepperConfigured ? 'configured' : 'missing', time: new Date().toISOString() } as const
  if (!deps.config.databaseUrl) return json(503, { status: 'not_configured', database: 'not_configured', ...base } satisfies HealthView)
  try {
    await createRepo(deps.db(deps.config.databaseUrl)).ping()
    return json(200, { status: 'ok', database: 'ok', ...base } satisfies HealthView)
  } catch {
    return json(503, { status: 'degraded', database: 'unreachable', ...base } satisfies HealthView)
  }
}

export async function handleApi(req: Request, deps: ApiDeps): Promise<Response> {
  const method = req.method.toUpperCase()
  const path = apiPath(req)
  try {
    if (path === '/api/health') {
      if (method !== 'GET') throw new ApiError('METHOD_NOT_ALLOWED', '不支持的请求方法')
      return await health(deps)
    }

    const parts = path.split('/').filter(Boolean) // ['api','trips',slug,...]
    if (parts[0] !== 'api' || parts[1] !== 'trips') throw new ApiError('NOT_FOUND', '接口不存在')

    if (!deps.config.databaseUrl) throw new ApiError('NOT_CONFIGURED', '云端功能尚未配置')
    const origin = deps.config.appOrigin ?? new URL(req.url).origin
    const ip = clientIp(req)
    const db = deps.db(deps.config.databaseUrl)
    const service = createService({ repo: createRepo(db), db, pepper: deps.config.tokenPepper, appOrigin: origin, clientIp: ip })
    const token = bearer(req)
    const [, , slug, sub, subId, subExtra] = parts
    const isUuid = (v: string | undefined) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

    // POST /api/trips
    if (!slug) {
      if (method !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED', '不支持的请求方法')
      // 进程内预过滤（挡住单实例洪泛，减轻数据库压力）；权威限流在数据库中（server/limits.ts）
      if (hitRateLimit(`create:${ip}`, 30, 10 * 60_000)) throw new ApiError('RATE_LIMITED', '创建太频繁，请稍后再试')
      const body = await readJson(req, createTripSchema)
      return json(201, await service.createTrip(body))
    }

    const route = `${method} ${sub ?? ''}${subId ? `/${subId}` : ''}${subExtra ? `/${subExtra}` : ''}`
    switch (true) {
      case route === 'GET public':
        return json(200, { trip: await service.getPublic(slug) })
      case route === 'GET ':
        return json(200, await service.getTrip(slug, token))
      case route === 'POST join': {
        if (hitRateLimit(`join:${ip}`, 60, 10 * 60_000)) throw new ApiError('RATE_LIMITED', '尝试次数过多，请稍后再试')
        const body = await readJson(req, joinTripSchema)
        return json(201, await service.join(slug, body))
      }
      case route === 'PUT preferences/me': {
        const body = await readJson(req, preferencesSchema)
        return json(200, await service.putMyPreferences(slug, token, body))
      }
      case route === 'GET consensus':
        return json(200, await service.getConsensus(slug, token))
      case route === 'PATCH state': {
        const body = await readJson(req, statePatchSchema)
        return json(200, await service.patchState(slug, token, body))
      }
      case route === 'POST lock': {
        const body = await readJson(req, lockSchema)
        return json(200, await service.lock(slug, token, body))
      }
      case method === 'DELETE' && sub === 'members' && !!subId && !subExtra: {
        if (!isUuid(subId)) throw new ApiError('MEMBER_NOT_FOUND', '成员不存在')
        return json(200, await service.removeMember(slug, token, subId))
      }
      /* ---------- 阶段三 ---------- */
      case route === 'POST leave': {
        await readOptionalJson(req, leaveSchema)
        return json(200, await service.leave(slug, token))
      }
      case route === 'POST transfer-organizer': {
        const body = await readJson(req, transferSchema)
        return json(200, await service.transferOrganizer(slug, token, body.memberId))
      }
      case route === 'POST archive':
        return json(200, await service.archive(slug, token))
      case route === 'POST recover-organizer': {
        if (hitRateLimit(`recover:${ip}`, 30, 15 * 60_000)) throw new ApiError('RATE_LIMITED', '恢复尝试次数过多，请稍后再试')
        const body = await readJson(req, recoverSchema)
        return json(200, await service.recoverOrganizer(slug, body))
      }
      case route === 'POST recovery-code':
        return json(200, await service.resetRecoveryCode(slug, token))
      case route === 'PATCH invite': {
        const body = await readJson(req, inviteSchema)
        return json(200, await service.updateInvite(slug, token, body))
      }
      case route === 'GET expenses':
        return json(200, (await service.getTrip(slug, token)).ledger)
      case route === 'POST expenses': {
        const body = await readJson(req, expenseCreateSchema)
        return json(201, await service.createExpense(slug, token, body))
      }
      case (method === 'PATCH' || method === 'DELETE') && sub === 'expenses' && !!subId && !subExtra: {
        if (!isUuid(subId)) throw new ApiError('EXPENSE_NOT_FOUND', '费用不存在或已删除')
        if (method === 'PATCH') {
          const body = await readJson(req, expenseUpdateSchema)
          return json(200, await service.updateExpense(slug, token, subId, body))
        }
        const body = await readJson(req, expenseDeleteSchema)
        return json(200, await service.deleteExpense(slug, token, subId, body.expectedVersion))
      }
      default:
        throw new ApiError('NOT_FOUND', '接口不存在')
    }
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e)
    const code = pgCode(e)
    // 只记录错误类别，不记录请求体、token、邀请码或 SQL 细节
    console.error(`[api] ${method} ${path.replace(/\/trips\/[^/]+/, '/trips/:slug')} failed`, code ?? (e as Error)?.name ?? 'Error')
    if (code === '23505') return errorResponse(new ApiError('VERSION_CONFLICT', '数据冲突，请刷新后重试'))
    if (code?.startsWith('08') || code === '57P01' || /fetch failed|ECONN|ETIMEDOUT/i.test(String((e as Error)?.message))) {
      return errorResponse(new ApiError('DATABASE_UNAVAILABLE', '数据库暂时不可用，请稍后重试'))
    }
    return errorResponse(new ApiError('INTERNAL_ERROR', '服务器开小差了，请稍后重试'))
  }
}
