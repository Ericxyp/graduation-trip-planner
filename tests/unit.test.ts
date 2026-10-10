/**
 * 单元测试：不需要数据库。运行：npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeConsensus, computePlanById, evaluatePlan, parsePlanId, planId, type ConsensusMember } from '../src/shared/consensus.js'
import { createTripSchema, joinTripSchema, preferencesSchema, statePatchSchema } from '../src/shared/schemas.js'
import type { Preferences } from '../src/shared/types.js'
import { MATCH_WEIGHTS, WEIGHT_TOTAL } from '../src/shared/weights.js'
import { readConfig } from '../server/config.js'
import { hitRateLimit, resetRateLimits } from '../server/rateLimit.js'
import { hashSecret, isPlausibleToken, newInviteCode, newSlug, newToken, normalizeInviteCode, verifySecret } from '../server/security.js'
import { toMemberSummary } from '../server/service.js'
import { splitSql } from '../server/sql.js'
import { readFileSync } from 'node:fs'

const trip = { candidateDestinations: ['成都', '青岛', '长沙'], dateStart: '2027-06-18', dateEnd: '2027-06-24' }
const P = (over: Partial<Preferences> = {}): Preferences => ({
  dates: ['2027-06-20', '2027-06-21', '2027-06-22', '2027-06-23'],
  budgetId: 'b3',
  destinations: ['成都', '青岛', '长沙'],
  pace: 'balanced',
  stay: 'any',
  musts: [],
  nos: [],
  ...over,
})
const M = (id: string, prefs: Preferences | null, role: 'organizer' | 'member' = 'member'): ConsensusMember => ({
  id,
  displayName: id.toUpperCase(),
  role,
  joinedAt: `2026-10-0${id.length}T00:00:00.000Z`,
  prefs,
})

describe('令牌与邀请码', () => {
  it('token 为 256 位随机值，哈希可验证且不同 pepper 不通用', () => {
    const t = newToken()
    assert.ok(isPlausibleToken(t))
    assert.notEqual(t, newToken())
    const h = hashSecret(t, 'pepper-a', 'token')
    assert.match(h, /^[0-9a-f]{64}$/)
    assert.ok(!h.includes(t))
    assert.ok(verifySecret(t, h, 'pepper-a', 'token'))
    assert.ok(!verifySecret(t, h, 'pepper-b', 'token'))
    assert.ok(!verifySecret(t, h, 'pepper-a', 'invite'), 'token 与邀请码使用不同的哈希域')
  })

  it('邀请码大小写与空格不敏感，错误码被拒绝', () => {
    const code = newInviteCode()
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/)
    const h = hashSecret(code, 'p', 'invite')
    assert.ok(verifySecret(normalizeInviteCode(` ${code.toLowerCase()} `), h, 'p', 'invite'))
    assert.ok(!verifySecret('AAAAAAAA', h, 'p', 'invite'))
  })

  it('slug 为 10 位小写随机串', () => {
    assert.match(newSlug(), /^[a-z2-9]{10}$/)
  })
})

describe('共识权重', () => {
  it('五维权重合计 100，且为 40/20/20/10/10', () => {
    assert.equal(WEIGHT_TOTAL, 100)
    assert.deepEqual(Object.values(MATCH_WEIGHTS), [40, 20, 20, 10, 10])
  })
})

describe('多成员共识计算', () => {
  const members = [
    M('a', P(), 'organizer'),
    M('bb', P({ budgetId: 'b2', destinations: ['长沙', '成都'] })),
    M('ccc', P({ dates: ['2027-06-18', '2027-06-19', '2027-06-20', '2027-06-21'], destinations: ['青岛'] })),
    M('dddd', null),
  ]

  it('少于 2 人填写时不生成方案', () => {
    const r = computeConsensus(trip, [M('a', P()), M('b', null)], 'a')
    assert.equal(r.status, 'need_more')
    assert.equal(r.plans.length, 0)
  })

  it('结果确定：同样输入两次计算完全一致', () => {
    const now = new Date('2026-10-10T00:00:00Z')
    assert.deepEqual(computeConsensus(trip, members, 'a', now), computeConsensus(trip, members, 'a', now))
  })

  it('生成 3 个不同目的地的方案，人均 = 各项费用之和', () => {
    const r = computeConsensus(trip, members, 'a')
    assert.equal(r.status, 'ready')
    assert.equal(r.filledCount, 3)
    assert.equal(new Set(r.plans.map((p) => p.destination)).size, r.plans.length)
    assert.deepEqual(r.plans.map((p) => p.kind), ['consensus', 'budget', 'memorable'])
    for (const p of r.plans) {
      assert.equal(p.perPerson, p.costs.reduce((s, c) => s + c.perPerson, 0))
      assert.ok(p.match >= 0 && p.match <= 100)
      assert.equal(p.participantCount, p.participants.length)
    }
  })

  it('匹配度 = 已填写成员个人得分的平均值', () => {
    const e = evaluatePlan('成都', '2027-06-20', 4, members)
    const avg = Math.round(e.evals.reduce((s, x) => s + x.score, 0) / e.evals.length)
    assert.equal(e.match, avg)
    assert.equal(e.participants.length, 2, '日期只有 a、bb 覆盖 6/20–6/23')
    const a = e.evals.find((x) => x.member.id === 'a')!
    assert.equal(a.score, a.parts.dates + a.parts.budget + a.parts.destination + a.parts.pace + a.parts.stay)
  })

  it('一票否决：触发“高温”底线的成员不计入参加人数，得分减半', () => {
    const ms = [M('a', P()), M('bb', P({ nos: ['35°C以上高温暴晒'] }))]
    const hot = evaluatePlan('长沙', '2027-06-20', 4, ms)
    const cool = evaluatePlan('成都', '2027-06-20', 4, ms)
    assert.equal(hot.participants.length, 1)
    assert.equal(cool.participants.length, 2)
    const b = hot.evals.find((x) => x.member.id === 'bb')!
    assert.deepEqual(b.vetoes, ['高温'])
    const raw = b.parts.dates + b.parts.budget + b.parts.destination + b.parts.pace + b.parts.stay
    assert.equal(b.score, Math.round(raw / 2))
  })

  it('方案 id 可还原并重新计算；越界日期被拒绝', () => {
    const id = planId('成都', '2027-06-20', 4)
    assert.deepEqual(parsePlanId(id), { dest: '成都', start: '2027-06-20', days: 4 })
    assert.ok(computePlanById(trip, members, id, 'a'))
    assert.equal(computePlanById(trip, members, planId('成都', '2027-06-23', 4), 'a'), null)
    assert.equal(computePlanById(trip, members, planId('上海', '2027-06-20', 4), 'a'), null)
  })

  it('隐私：输出中不出现任何成员的预算档位、必选与底线原文', () => {
    const ms = [M('a', P({ musts: ['每天睡够7小时'], nos: ['红眼航班或夜车'], budgetId: 'b5' })), M('bb', P({ budgetId: 'b1', nos: ['35°C以上高温暴晒'] }))]
    const out = JSON.stringify(computeConsensus(trip, ms, 'a'))
    for (const secret of ['b5', 'b1', 'budgetId', '每天睡够7小时', '红眼航班或夜车', '35°C以上高温暴晒', '"nos"', '"musts"']) {
      assert.ok(!out.includes(secret), `泄漏：${secret}`)
    }
    // 查看者只能看到自己的个人得分
    const plan = computeConsensus(trip, ms, 'a').plans[0]
    assert.ok(plan.myFit)
    assert.equal(computeConsensus(trip, ms, null).plans[0].myFit, null)
  })

  it('公开成员摘要只包含昵称、角色与填写状态', () => {
    const s = toMemberSummary({ id: 'x', trip_id: 't', display_name: '小林', role: 'organizer', color: '#fff', joined_at: '2026-01-01T00:00:00.000Z', prefs: P({ budgetId: 'b5' }) })
    assert.deepEqual(Object.keys(s).sort(), ['color', 'displayName', 'hasPreferences', 'id', 'joinedAt', 'role'])
    assert.equal(s.hasPreferences, true)
  })
})

describe('输入校验', () => {
  const ok = { name: '2027届毕业旅行', originCity: '上海', candidateDestinations: ['成都', '青岛'], dateStart: '2027-06-18', dateEnd: '2027-06-24', memberLimit: 8, organizerName: '小林' }
  it('成员人数上限必须在 2–30 之间', () => {
    assert.ok(createTripSchema.safeParse(ok).success)
    assert.ok(!createTripSchema.safeParse({ ...ok, memberLimit: 1 }).success)
    assert.ok(!createTripSchema.safeParse({ ...ok, memberLimit: 31 }).success)
    assert.ok(!createTripSchema.safeParse({ ...ok, memberLimit: 2.5 }).success)
  })
  it('结束日期不能早于开始日期；候选地 2–5 个且不重复', () => {
    assert.ok(!createTripSchema.safeParse({ ...ok, dateEnd: '2027-06-01' }).success)
    assert.ok(!createTripSchema.safeParse({ ...ok, candidateDestinations: ['成都'] }).success)
    assert.ok(!createTripSchema.safeParse({ ...ok, candidateDestinations: ['成都', '成都'] }).success)
    assert.ok(!createTripSchema.safeParse({ ...ok, candidateDestinations: ['a', 'b', 'c', 'd', 'e', 'f'] }).success)
  })
  it('拒绝未知字段（例如客户端伪造 role / memberId）', () => {
    assert.ok(!createTripSchema.safeParse({ ...ok, role: 'organizer' }).success)
    assert.ok(!joinTripSchema.safeParse({ displayName: 'a', inviteCode: 'ABCDEFGH', role: 'organizer' }).success)
    assert.ok(!preferencesSchema.safeParse({ ...P(), memberId: 'x' }).success)
  })
  it('字符串长度受限，空白会被规整', () => {
    assert.ok(!createTripSchema.safeParse({ ...ok, organizerName: 'x'.repeat(17) }).success)
    const r = joinTripSchema.parse({ displayName: '  阿   哲 ', inviteCode: ' abcd2345 ' })
    assert.deepEqual(r, { displayName: '阿 哲', inviteCode: 'ABCD2345' })
  })
  it('状态更新必须携带 expectedVersion', () => {
    assert.ok(!statePatchSchema.safeParse({ op: 'paid', paid: true }).success)
    assert.ok(statePatchSchema.safeParse({ op: 'paid', paid: true, expectedVersion: 3 }).success)
  })
})

describe('其他', () => {
  it('限流：窗口内超过次数被拒绝', () => {
    resetRateLimits()
    for (let i = 0; i < 3; i++) assert.equal(hitRateLimit('k', 3, 1000, 0), false)
    assert.equal(hitRateLimit('k', 3, 1000, 10), true)
    assert.equal(hitRateLimit('k', 3, 1000, 2000), false)
  })
  it('pepper 少于 16 位视为未配置', () => {
    assert.equal(readConfig({ TOKEN_PEPPER: 'short' }).pepperConfigured, false)
    assert.equal(readConfig({ DATABASE_URL: '' }).databaseUrl, null)
  })
  it('迁移文件可拆分为独立语句', () => {
    const stmts = splitSql(readFileSync('db/migrations/001_initial.sql', 'utf8'))
    assert.ok(stmts.length >= 9)
    assert.ok(stmts.every((s) => !s.includes('--')))
  })
})
