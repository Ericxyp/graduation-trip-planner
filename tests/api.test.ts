/**
 * API 集成测试：直接调用 handleApi（与 Vercel Function 同一入口），连接真实 Postgres。
 *
 * 需要：TEST_DATABASE_URL=postgres://user:pass@localhost:5432/gradtrip_test
 * 安全：会清空并重建测试库中的表，因此只允许连接 localhost / 127.0.0.1，
 *      或显式设置 ALLOW_TEST_DB_RESET=1（只对一次性的 Neon 测试分支使用）。绝不要指向生产库。
 * 未设置 TEST_DATABASE_URL 时整组测试跳过。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import type { CreateTripResult, JoinTripResult, Preferences, TripView } from '../src/shared/types.js'
import { readConfig } from '../server/config.js'
import { resetRateLimits } from '../server/rateLimit.js'
import { handleApi } from '../server/router.js'
import { createPgWireDb } from './helpers/pgwire.js'

const url = process.env.TEST_DATABASE_URL
const safe = !!url && (/@(localhost|127\.0\.0\.1)[:/]/.test(url) || process.env.ALLOW_TEST_DB_RESET === '1')
const ORIGIN = 'https://biye-dazi-ju.vercel.app'
const db = url ? createPgWireDb(url) : null
const config = { ...readConfig({ DATABASE_URL: url, TOKEN_PEPPER: 'test-pepper-0123456789abcdef', APP_ORIGIN: ORIGIN }) }

async function call<T = any>(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const req = new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  const res = await handleApi(req, { config, db: () => db! })
  return { status: res.status, body: (await res.json()) as T, headers: res.headers }
}

const tripInput = {
  name: '2027届毕业旅行',
  originCity: '上海',
  candidateDestinations: ['成都', '青岛', '长沙'],
  dateStart: '2027-06-18',
  dateEnd: '2027-06-24',
  memberLimit: 3,
  organizerName: '小林',
}
const prefsA: Preferences = { dates: ['2027-06-20', '2027-06-21', '2027-06-22', '2027-06-23'], budgetId: 'b4', destinations: ['成都', '青岛'], pace: 'balanced', stay: 'any', musts: ['要有毕业合影/跟拍'], nos: ['红眼航班或夜车'] }
const prefsB: Preferences = { dates: ['2027-06-19', '2027-06-20', '2027-06-21', '2027-06-22', '2027-06-23'], budgetId: 'b2', destinations: ['长沙', '成都'], pace: 'relax', stay: 'hotel', musts: ['每天睡够7小时'], nos: ['35°C以上高温暴晒'] }

describe('API 集成（需要 TEST_DATABASE_URL）', { skip: !url ? '未设置 TEST_DATABASE_URL' : !safe ? 'TEST_DATABASE_URL 不是本地库，且未设置 ALLOW_TEST_DB_RESET=1' : false }, () => {
  let created: CreateTripResult
  let joined: JoinTripResult
  let slug = ''
  let tokA = ''
  let tokB = ''

  before(async () => {
    await db!.exec('DROP TABLE IF EXISTS trip_state, preferences, members, trips, schema_migrations CASCADE')
    await db!.exec(readFileSync('db/migrations/001_initial.sql', 'utf8'))
    await db!.exec(readFileSync('db/migrations/001_initial.sql', 'utf8')) // 幂等：重复执行不报错
    resetRateLimits()
  })
  after(() => resetRateLimits())

  it('GET /api/health 在配置数据库后返回 ok', async () => {
    const r = await call('GET', '/api/health')
    assert.equal(r.status, 200)
    assert.equal(r.body.database, 'ok')
  })

  it('创建旅行局：只返回一次明文 token 与邀请码，数据库只存哈希', async () => {
    const r = await call<CreateTripResult>('POST', '/api/trips', tripInput)
    assert.equal(r.status, 201)
    created = r.body
    slug = created.trip.slug
    tokA = created.identity.memberToken
    assert.equal(created.identity.role, 'organizer')
    assert.equal(created.trip.memberCount, 1)
    assert.equal(created.trip.organizerName, '小林')
    assert.match(created.invite.url, new RegExp(`^${ORIGIN}/trip/${slug}/join#code=${created.invite.code}$`))
    const rows = await db!.query('SELECT invite_code_hash, organizer_token_hash FROM trips WHERE slug = $1', [slug])
    const dump = JSON.stringify(rows) + JSON.stringify(await db!.query('SELECT member_token_hash FROM members'))
    assert.ok(!dump.includes(tokA) && !dump.includes(created.invite.code))
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  })

  it('访客可读取公开摘要，但不能读取共享状态', async () => {
    const pub = await call('GET', `/api/trips/${slug}/public`)
    assert.equal(pub.status, 200)
    assert.deepEqual(Object.keys(pub.body.trip).sort(), ['candidateDestinations', 'createdAt', 'dateEnd', 'dateStart', 'inviteDeadline', 'inviteExpired', 'isFull', 'memberCount', 'memberLimit', 'name', 'organizerName', 'originCity', 'slug', 'status'])
    const anon = await call('GET', `/api/trips/${slug}`)
    assert.equal(anon.status, 401)
    assert.equal(anon.body.error.code, 'UNAUTHORIZED')
    const bogus = await call('GET', `/api/trips/${slug}`, undefined, 'x'.repeat(43))
    assert.equal(bogus.status, 401)
  })

  it('错误邀请码被拒绝', async () => {
    const r = await call('POST', `/api/trips/${slug}/join`, { displayName: '阿哲', inviteCode: 'WRONG234' })
    assert.equal(r.status, 403)
    assert.equal(r.body.error.code, 'INVALID_INVITE_CODE')
  })

  it('正确邀请码加入（大小写不敏感）', async () => {
    const r = await call<JoinTripResult>('POST', `/api/trips/${slug}/join`, { displayName: '阿哲', inviteCode: created.invite.code.toLowerCase() })
    assert.equal(r.status, 201)
    joined = r.body
    tokB = joined.identity.memberToken
    assert.equal(joined.identity.role, 'member')
    assert.equal(joined.trip.memberCount, 2)
  })

  it('重复昵称被拒绝', async () => {
    const r = await call('POST', `/api/trips/${slug}/join`, { displayName: '阿哲', inviteCode: created.invite.code })
    assert.equal(r.status, 409)
    assert.equal(r.body.error.code, 'DISPLAY_NAME_TAKEN')
  })

  it('只有 1 人填写时不生成共识', async () => {
    const r = await call<TripView>('PUT', `/api/trips/${slug}/preferences/me`, prefsA, tokA)
    assert.equal(r.status, 200)
    assert.equal(r.body.filledCount, 1)
    assert.equal(r.body.consensus.status, 'need_more')
  })

  it('偏好只能写给自己：请求体里夹带 memberId 会被拒绝', async () => {
    const r = await call('PUT', `/api/trips/${slug}/preferences/me`, { ...prefsB, memberId: created.identity.memberId }, tokB)
    assert.equal(r.status, 400)
    assert.equal(r.body.error.code, 'INVALID_INPUT')
  })

  it('越界日期 / 非候选目的地被拒绝', async () => {
    const r1 = await call('PUT', `/api/trips/${slug}/preferences/me`, { ...prefsB, dates: ['2027-07-01'] }, tokB)
    assert.equal(r1.status, 400)
    const r2 = await call('PUT', `/api/trips/${slug}/preferences/me`, { ...prefsB, destinations: ['上海'] }, tokB)
    assert.equal(r2.status, 400)
  })

  it('两人填写后：服务端生成共识，双方看到相同进度', async () => {
    const rb = await call<TripView>('PUT', `/api/trips/${slug}/preferences/me`, prefsB, tokB)
    assert.equal(rb.status, 200)
    const ra = await call<TripView>('GET', `/api/trips/${slug}`, undefined, tokA)
    assert.equal(ra.body.filledCount, 2)
    assert.equal(rb.body.filledCount, 2)
    assert.equal(ra.body.consensus.status, 'ready')
    assert.deepEqual(ra.body.consensus.plans.map((p) => [p.id, p.match, p.perPerson]), rb.body.consensus.plans.map((p) => [p.id, p.match, p.perPerson]))
    // A 修改偏好不影响 B 的偏好
    assert.deepEqual(rb.body.me.preferences, prefsB)
    assert.deepEqual(ra.body.me.preferences, prefsA)
  })

  it('隐私：B 看不到 A 的预算、必选和底线；响应中没有任何哈希', async () => {
    const r = await call<TripView>('GET', `/api/trips/${slug}`, undefined, tokB)
    const s = JSON.stringify(r.body)
    // 只出现 B 自己的一份 budgetId（b2），不会出现 A 的 b4
    assert.equal(s.match(/"budgetId"/g)?.length, 1)
    for (const leak of ['"budgetId":"b4"', '红眼航班或夜车', '要有毕业合影/跟拍', 'token_hash', 'invite_code', tokA, created.invite.code]) {
      assert.ok(!s.includes(leak), `泄漏：${leak}`)
    }
    // B 自己的偏好对 B 可见
    assert.ok(s.includes('35°C以上高温暴晒'))
    const c = await call('GET', `/api/trips/${slug}/consensus`, undefined, tokB)
    assert.equal(c.status, 200)
    assert.ok(!JSON.stringify(c.body).includes('budgetId'))
  })

  it('普通成员无法锁定方案、无法移除成员', async () => {
    const v = (await call<TripView>('GET', `/api/trips/${slug}`, undefined, tokB)).body
    const r = await call('POST', `/api/trips/${slug}/lock`, { planId: v.consensus.plans[0].id, expectedVersion: v.state.version }, tokB)
    assert.equal(r.status, 403)
    assert.equal(r.body.error.code, 'FORBIDDEN')
    const rm = await call('DELETE', `/api/trips/${slug}/members/${created.identity.memberId}`, undefined, tokB)
    assert.equal(rm.status, 403)
  })

  it('版本冲突返回 409 VERSION_CONFLICT', async () => {
    const v = (await call<TripView>('GET', `/api/trips/${slug}`, undefined, tokA)).body
    const r = await call('POST', `/api/trips/${slug}/lock`, { planId: v.consensus.plans[0].id, expectedVersion: v.state.version - 1 }, tokA)
    assert.equal(r.status, 409)
    assert.equal(r.body.error.code, 'VERSION_CONFLICT')
  })

  it('发起人锁定方案成功，另一位成员看到相同锁定结果', async () => {
    const v = (await call<TripView>('GET', `/api/trips/${slug}`, undefined, tokA)).body
    const target = v.consensus.plans[0]
    const r = await call<TripView>('POST', `/api/trips/${slug}/lock`, { planId: target.id, expectedVersion: v.state.version }, tokA)
    assert.equal(r.status, 200)
    assert.equal(r.body.state.lockedPlanId, target.id)
    assert.equal(r.body.trip.status, 'locked')
    const b = (await call<TripView>('GET', `/api/trips/${slug}`, undefined, tokB)).body
    assert.equal(b.state.lockedPlanId, target.id)
    assert.equal(b.lockedPlan?.destination, target.destination)
    assert.equal(b.lockedPlan?.perPerson, target.perPerson)
    assert.ok(b.revision > v.revision)
  })

  it('不存在的方案不能锁定', async () => {
    const v = (await call<TripView>('GET', `/api/trips/${slug}`, undefined, tokA)).body
    const r = await call('POST', `/api/trips/${slug}/lock`, { planId: '2027-06-20|4|上海', expectedVersion: v.state.version }, tokA)
    assert.equal(r.status, 404)
    assert.equal(r.body.error.code, 'PLAN_NOT_FOUND')
  })

  it('任务：只能更新自己负责的；付款只能标记自己', async () => {
    const v = (await call<TripView>('GET', `/api/trips/${slug}`, undefined, tokB)).body
    const items = v.lockedPlan!.itinerary.flatMap((d) => d.items)
    const mine = items.find((i) => i.ownerId === joined.identity.memberId)!
    const others = items.find((i) => i.ownerId !== joined.identity.memberId)!
    const denied = await call('PATCH', `/api/trips/${slug}/state`, { op: 'task', key: others.key, done: true, expectedVersion: v.state.version }, tokB)
    assert.equal(denied.status, 403)
    const okR = await call<TripView>('PATCH', `/api/trips/${slug}/state`, { op: 'task', key: mine.key, done: true, expectedVersion: v.state.version }, tokB)
    assert.equal(okR.status, 200)
    assert.equal(okR.body.state.tasks[mine.key], true)
    const paid = await call<TripView>('PATCH', `/api/trips/${slug}/state`, { op: 'paid', paid: true, expectedVersion: okR.body.state.version }, tokB)
    assert.deepEqual(paid.body.state.paidMembers, [joined.identity.memberId])
    const stale = await call('PATCH', `/api/trips/${slug}/state`, { op: 'paid', paid: false, expectedVersion: okR.body.state.version }, tokB)
    assert.equal(stale.status, 409)
  })

  it('修改偏好后，已锁定方案保持不变', async () => {
    await call('PUT', `/api/trips/${slug}/preferences/me`, { ...prefsB, destinations: ['青岛'] }, tokB)
    const before = (await call<TripView>('GET', `/api/trips/${slug}`, undefined, tokA)).body
    assert.equal(before.lockedPlan?.id, before.state.lockedPlanId)
  })

  it('人数上限：并发加入时不会超额', async () => {
    resetRateLimits()
    const rs = await Promise.all(['同学1', '同学2', '同学3', '同学4'].map((n) => call('POST', `/api/trips/${slug}/join`, { displayName: n, inviteCode: created.invite.code })))
    const ok = rs.filter((r) => r.status === 201).length
    assert.equal(ok, 1, '上限 3 人，已有 2 人，只能再进 1 人')
    assert.ok(rs.filter((r) => r.status !== 201).every((r) => r.body.error.code === 'MEMBER_LIMIT_REACHED'))
    const pub = await call('GET', `/api/trips/${slug}/public`)
    assert.equal(pub.body.trip.memberCount, 3)
    assert.equal(pub.body.trip.isFull, true)
  })

  it('发起人可移除成员', async () => {
    const v = (await call<TripView>('GET', `/api/trips/${slug}`, undefined, tokA)).body
    const extra = v.members.find((m) => m.displayName.startsWith('同学'))!
    const r = await call<TripView>('DELETE', `/api/trips/${slug}/members/${extra.id}`, undefined, tokA)
    assert.equal(r.status, 200)
    assert.equal(r.body.members.length, 2)
  })

  it('邀请过期时拒绝加入', async () => {
    const r = await call<CreateTripResult>('POST', '/api/trips', { ...tripInput, name: '过期的局', inviteDeadline: '2020-01-01T00:00:00Z' })
    const j = await call('POST', `/api/trips/${r.body.trip.slug}/join`, { displayName: '迟到的人', inviteCode: r.body.invite.code })
    assert.equal(j.status, 410)
    assert.equal(j.body.error.code, 'INVITE_EXPIRED')
  })

  it('输入与协议错误：415 / 413 / 400 / 404', async () => {
    const ct = await call('POST', '/api/trips', 'name=x', undefined, { 'content-type': 'text/plain' })
    assert.equal(ct.status, 415)
    const big = await call('POST', '/api/trips', JSON.stringify({ ...tripInput, name: 'x'.repeat(20000) }))
    assert.equal(big.status, 413)
    const bad = await call('POST', '/api/trips', { ...tripInput, memberLimit: 99 })
    assert.equal(bad.status, 400)
    assert.equal(bad.body.error.code, 'INVALID_INPUT')
    const nf = await call('GET', '/api/trips/doesnotexist/public')
    assert.equal(nf.status, 404)
    assert.equal(nf.body.error.code, 'TRIP_NOT_FOUND')
  })

  it('rewrite 形式的路径（?__path=）与直接路径等价', async () => {
    const r = await call('GET', `/api/router?__path=trips/${slug}/public`)
    assert.equal(r.status, 200)
    assert.equal(r.body.trip.slug, slug)
  })

  it('创建接口限流', async () => {
    resetRateLimits()
    const codes: number[] = []
    for (let i = 0; i < 11; i++) codes.push((await call('POST', '/api/trips', { ...tripInput, name: `限流测试${i}` }, undefined, { 'x-forwarded-for': '9.9.9.9' })).status)
    assert.equal(codes.filter((c) => c === 201).length, 10)
    assert.equal(codes.at(-1), 429)
  })
})

describe('未配置数据库', () => {
  it('health 返回 not_configured（503），接口返回 NOT_CONFIGURED，不伪装成功', async () => {
    const cfg = readConfig({})
    const h = await handleApi(new Request(`${ORIGIN}/api/health`), { config: cfg, db: () => { throw new Error('should not connect') } })
    assert.equal(h.status, 503)
    assert.equal((await h.json()).database, 'not_configured')
    const c = await handleApi(new Request(`${ORIGIN}/api/trips`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tripInput) }), { config: cfg, db: () => { throw new Error('x') } })
    assert.equal(c.status, 503)
    assert.equal((await c.json()).error.code, 'NOT_CONFIGURED')
  })

  it('数据库不可达时返回 DATABASE_UNAVAILABLE，不泄漏内部错误', async () => {
    const cfg = readConfig({ DATABASE_URL: 'postgres://x', TOKEN_PEPPER: 'test-pepper-0123456789abcdef' })
    const failing = { query: async () => { throw Object.assign(new Error('fetch failed: connect ECONNREFUSED 10.0.0.1'), {}) }, transaction: async () => { throw new Error('fetch failed') } }
    const r = await handleApi(new Request(`${ORIGIN}/api/trips/abcdefghij/public`), { config: cfg, db: () => failing })
    const body = await r.json()
    assert.equal(r.status, 503)
    assert.equal(body.error.code, 'DATABASE_UNAVAILABLE')
    assert.ok(!JSON.stringify(body).includes('10.0.0.1'))
  })
})
