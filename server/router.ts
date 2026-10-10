/**
 * API 路由：Web 标准 Request → Response。
 * Vercel Functions（api/[...route].ts 等）与测试都直接调用 handleApi，不依赖 Express。
 */
import type { ZodType } from 'zod'
import { createTripSchema, joinTripSchema, lockSchema, preferencesSchema, statePatchSchema } from '../src/shared/schemas.js'
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
  return json(e.status, body, e.code === 'RATE_LIMITED' ? { 'retry-after': '60' } : {})
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
    const service = createService({ repo: createRepo(deps.db(deps.config.databaseUrl)), pepper: deps.config.tokenPepper, appOrigin: origin })
    const token = bearer(req)
    const ip = clientIp(req)
    const [, , slug, sub, subId, subExtra] = parts

    // POST /api/trips
    if (!slug) {
      if (method !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED', '不支持的请求方法')
      if (hitRateLimit(`create:${ip}`, 10, 10 * 60_000)) throw new ApiError('RATE_LIMITED', '创建太频繁，请稍后再试')
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
        if (hitRateLimit(`join:${ip}`, 20, 10 * 60_000) || hitRateLimit(`join-trip:${slug}`, 60, 10 * 60_000)) throw new ApiError('RATE_LIMITED', '尝试次数过多，请稍后再试')
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
        if (!/^[0-9a-f-]{36}$/i.test(subId)) throw new ApiError('MEMBER_NOT_FOUND', '成员不存在')
        return json(200, await service.removeMember(slug, token, subId))
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
