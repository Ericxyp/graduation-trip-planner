/**
 * 阶段三 API 集成测试：退出与重算、发起人恢复、邀请管理、费用台账、动态脱敏、数据库级限流。
 * 只连接本地测试库（localhost 且库名含 test），不会 DROP 任何表：只按顺序幂等执行全部迁移后创建新的旅行局。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { before, describe, it } from 'node:test'
import type { CreateTripResult, JoinTripResult, LeaveResult, Preferences, TripView } from '../src/shared/types.js'
import { readConfig } from '../server/config.js'
import { resetRateLimits } from '../server/rateLimit.js'
import { handleApi } from '../server/router.js'
import { createPgWireDb } from './helpers/pgwire.js'

const url = process.env.TEST_DATABASE_URL
function isSafeTestDb(raw: string | undefined): boolean {
  if (!raw) return false
  try {
    const u = new URL(raw)
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname) && /test/i.test(u.pathname.slice(1))
  } catch {
    return false
  }
}
const ORIGIN = 'https://biye-dazi-ju.vercel.app'
const db = url && isSafeTestDb(url) ? createPgWireDb(url) : null
const config = readConfig({ DATABASE_URL: url, TOKEN_PEPPER: 'test-pepper-0123456789abcdef', APP_ORIGIN: ORIGIN })
const rnd = () => Math.floor(Math.random() * 250) + 1
const logs: string[] = []

async function call<T = any>(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const req = new Request(`${ORIGIN}${path}`, {
    method,
    headers: { 'x-forwarded-for': `10.${rnd()}.${rnd()}.${rnd()}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const orig = console.error
  console.error = (...a: unknown[]) => logs.push(a.map(String).join(' '))
  try {
    const res = await handleApi(req, { config, db: () => db! })
    return { status: res.status, body: (await res.json()) as T, headers: res.headers }
  } finally {
    console.error = orig
  }
}

const P = (over: Partial<Preferences> = {}): Preferences => ({
  dates: ['2027-06-20', '2027-06-21', '2027-06-22', '2027-06-23'],
  budgetId: 'b4',
  destinations: ['成都', '青岛'],
  pace: 'balanced',
  stay: 'any',
  musts: [],
  nos: [],
  ...over,
})
const tripInput = { name: '阶段三验收局', originCity: '上海', candidateDestinations: ['成都', '青岛', '长沙'], dateStart: '2027-06-18', dateEnd: '2027-06-24', memberLimit: 6, organizerName: '小林' }

async function setupTrip(names: string[], opts: { lock?: boolean } = {}) {
  const c = await call<CreateTripResult>('POST', '/api/trips', tripInput)
  assert.equal(c.status, 201)
  const slug = c.body.trip.slug
  const toks: Record<string, string> = { 小林: c.body.identity.memberToken }
  const ids: Record<string, string> = { 小林: c.body.identity.memberId }
  for (const n of names) {
    const j = await call<JoinTripResult>('POST', `/api/trips/${slug}/join`, { displayName: n, inviteCode: c.body.invite.code })
    assert.equal(j.status, 201, JSON.stringify(j.body))
    toks[n] = j.body.identity.memberToken
    ids[n] = j.body.identity.memberId
  }
  for (const n of Object.keys(toks)) assert.equal((await call('PUT', `/api/trips/${slug}/preferences/me`, P(), toks[n])).status, 200)
  let view = (await call<TripView>('GET', `/api/trips/${slug}`, undefined, toks.小林)).body
  if (opts.lock) {
    const l = await call<TripView>('POST', `/api/trips/${slug}/lock`, { planId: view.consensus.plans[0].id, expectedVersion: view.state.version }, toks.小林)
    assert.equal(l.status, 200)
    view = l.body
  }
  return { slug, created: c.body, toks, ids, view }
}

const get = async (slug: string, tok: string) => (await call<TripView>('GET', `/api/trips/${slug}`, undefined, tok)).body

describe('阶段三 API（需要本地 TEST_DATABASE_URL）', { skip: !url ? '未设置 TEST_DATABASE_URL' : !db ? '不是本地测试库，已跳过' : false }, () => {
  before(async () => {
    // 不清空任何表：只幂等执行全部迁移
    await db!.exec(readFileSync('db/migrations/001_initial.sql', 'utf8'))
    await db!.exec(readFileSync('db/migrations/002_stage_three.sql', 'utf8'))
    resetRateLimits()
  })

  describe('成员退出与重算', () => {
    it('发起人不能直接退出', async () => {
      const t = await setupTrip(['阿哲'])
      const r = await call('POST', `/api/trips/${t.slug}/leave`, undefined, t.toks.小林)
      assert.equal(r.status, 409)
      assert.equal(r.body.error.code, 'ORGANIZER_CANNOT_LEAVE')
    })

    it('普通成员退出：人数、人均、任务重算，锁定方案目的地不变，token 失效，重复退出幂等', async () => {
      const t = await setupTrip(['阿哲', '糖糖', '大鹏'], { lock: true })
      const before = t.view.lockedPlan!
      assert.equal(before.participantCount, 4)
      const tasksOfTang = before.itinerary.flatMap((d) => d.items).filter((i) => i.ownerId === t.ids.糖糖).length
      assert.ok(tasksOfTang > 0)

      const r = await call<LeaveResult>('POST', `/api/trips/${t.slug}/leave`, undefined, t.toks.糖糖)
      assert.equal(r.status, 200)
      assert.equal(r.body.status, 'left')
      const s = r.body.summary!
      assert.equal(s.countBefore, 4)
      assert.equal(s.countAfter, 3)
      assert.equal(s.perPersonBefore, before.perPerson)
      assert.ok(s.perPersonAfter > s.perPersonBefore, '公共费用由更少的人分摊')
      assert.equal(s.reassigned, tasksOfTang)
      assert.equal(s.lockedDestination, before.destination)

      const after = await get(t.slug, t.toks.小林)
      assert.equal(after.members.length, 3)
      assert.equal(after.trip.memberCount, 3)
      assert.equal(after.lockedPlan!.id, before.id, '锁定方案不变')
      assert.equal(after.lockedPlan!.participantCount, 3)
      assert.equal(after.lockedPlan!.perPerson, s.perPersonAfter)
      const items = after.lockedPlan!.itinerary.flatMap((d) => d.items)
      assert.ok(items.every((i) => i.ownerId !== t.ids.糖糖), '退出者名下没有任务')
      // 其他人原有的任务负责人不变
      const keptBefore = before.itinerary.flatMap((d) => d.items).filter((i) => i.ownerId !== t.ids.糖糖)
      for (const k of keptBefore) assert.equal(items.find((i) => i.key === k.key)!.ownerId, k.ownerId)
      const ev = after.activity.find((a) => a.type === 'member_left')!
      assert.equal(ev.text, '糖糖退出了旅行局')
      assert.deepEqual(ev.leave, s)

      const denied = await call('GET', `/api/trips/${t.slug}`, undefined, t.toks.糖糖)
      assert.equal(denied.status, 401)
      assert.equal(denied.body.error.code, 'MEMBER_LEFT')
      const again = await call<LeaveResult>('POST', `/api/trips/${t.slug}/leave`, undefined, t.toks.糖糖)
      assert.equal(again.status, 200)
      assert.equal(again.body.status, 'already_left')
      assert.equal((await get(t.slug, t.toks.小林)).members.length, 3, '重复退出不改变人数')

      // 部署后迁移（003）执行前：阶段二的全表唯一约束仍在，已退出成员占用昵称，给出明确提示
      const blocked = await call('POST', `/api/trips/${t.slug}/join`, { displayName: '糖糖', inviteCode: t.created.invite.code })
      assert.equal(blocked.status, 409)
      assert.equal(blocked.body.error.message, '这个昵称属于一位已退出的成员，请换一个昵称')
      // 执行部署后迁移（幂等，两次）：只保留活跃成员部分唯一索引，同名可以重新加入
      for (let i = 0; i < 2; i++) await db!.exec(readFileSync('db/migrations/post-deploy/003_drop_legacy_name_unique.sql', 'utf8'))
      const rejoin = await call('POST', `/api/trips/${t.slug}/join`, { displayName: '糖糖', inviteCode: t.created.invite.code })
      assert.equal(rejoin.status, 201)
      // 活跃成员之间仍然不能重名
      const dup = await call('POST', `/api/trips/${t.slug}/join`, { displayName: '糖糖', inviteCode: t.created.invite.code })
      assert.equal(dup.status, 409)
      assert.equal(dup.body.error.message, '这个昵称已被使用，换一个试试')
    })

    it('并发退出：人数、版本与动态条数一致', async () => {
      const t = await setupTrip(['甲', '乙', '丙', '丁'], { lock: true })
      const rs = await Promise.all(['甲', '乙', '丙'].map((n) => call<LeaveResult>('POST', `/api/trips/${t.slug}/leave`, undefined, t.toks[n])))
      assert.deepEqual(rs.map((r) => r.status), [200, 200, 200])
      assert.ok(rs.every((r) => r.body.status === 'left'))
      const v = await get(t.slug, t.toks.小林)
      assert.equal(v.members.length, 2)
      assert.equal(v.lockedPlan!.participantCount, 2)
      assert.equal(v.activity.filter((a) => a.type === 'member_left').length, 3)
      const counts = rs.map((r) => r.body.summary!.countAfter).sort()
      assert.deepEqual(counts, [2, 3, 4], '每次退出基于最新人数计算，不会重复或丢失')
      const owners = new Set(v.lockedPlan!.itinerary.flatMap((d) => d.items).map((i) => i.ownerId))
      assert.ok([...owners].every((id) => id === t.ids.小林 || id === t.ids.丁))
    })

    it('发起人移除成员同样软删除并重算；被移除者 token 失效', async () => {
      const t = await setupTrip(['阿哲', '糖糖'], { lock: true })
      const r = await call<TripView>('DELETE', `/api/trips/${t.slug}/members/${t.ids.阿哲}`, undefined, t.toks.小林)
      assert.equal(r.status, 200)
      assert.equal(r.body.members.length, 2)
      assert.equal(r.body.activity[0].type, 'member_removed')
      assert.equal((await call('GET', `/api/trips/${t.slug}`, undefined, t.toks.阿哲)).status, 401)
      const row = await db!.query('SELECT left_at IS NOT NULL AS left FROM members WHERE id = $1::uuid', [t.ids.阿哲])
      assert.equal(row[0].left, true, '历史记录保留（软删除）')
    })

    it('转让发起人后原发起人可以退出；解散后只读', async () => {
      const t = await setupTrip(['阿哲'])
      const tr = await call<TripView>('POST', `/api/trips/${t.slug}/transfer-organizer`, { memberId: t.ids.阿哲 }, t.toks.小林)
      assert.equal(tr.status, 200)
      assert.equal(tr.body.me.role, 'member')
      assert.equal((await get(t.slug, t.toks.阿哲)).me.role, 'organizer')
      assert.equal((await call('POST', `/api/trips/${t.slug}/leave`, undefined, t.toks.小林)).body.status, 'left')
      const ar = await call<TripView>('POST', `/api/trips/${t.slug}/archive`, undefined, t.toks.阿哲)
      assert.equal(ar.body.trip.status, 'archived')
      assert.equal(ar.body.trip.inviteStatus, 'closed')
      const w = await call('PUT', `/api/trips/${t.slug}/preferences/me`, P(), t.toks.阿哲)
      assert.equal(w.status, 409)
      assert.equal(w.body.error.code, 'TRIP_ARCHIVED')
    })
  })

  describe('发起人恢复', () => {
    it('创建时返回一次恢复码，数据库只存哈希', async () => {
      const t = await setupTrip([])
      assert.match(t.created.recovery.code, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/)
      const rows = await db!.query('SELECT recovery_code_hash FROM trips WHERE slug = $1', [t.slug])
      assert.match(rows[0].recovery_code_hash as string, /^[0-9a-f]{64}$/)
      assert.ok(!JSON.stringify(rows).includes(t.created.recovery.code.replace(/-/g, '')))
    })

    it('正确恢复码签发新的发起人身份，旧 token 仍然有效；错误码与普通成员无法提权；不泄漏恢复码', async () => {
      const t = await setupTrip(['阿哲'])
      const code = t.created.recovery.code
      const wrong = await call('POST', `/api/trips/${t.slug}/recover-organizer`, { recoveryCode: 'AAAA-BBBB-CCCC-DDDD' }, t.toks.阿哲)
      assert.equal(wrong.status, 403)
      assert.equal(wrong.body.error.code, 'INVALID_RECOVERY_CODE')
      assert.equal((await get(t.slug, t.toks.阿哲)).me.role, 'member', '普通成员没有被提权')

      logs.length = 0
      const ok = await call<JoinTripResult>('POST', `/api/trips/${t.slug}/recover-organizer`, { recoveryCode: code.toLowerCase() })
      assert.equal(ok.status, 200)
      assert.equal(ok.body.identity.role, 'organizer')
      assert.equal(ok.body.identity.memberId, t.ids.小林)
      assert.notEqual(ok.body.identity.memberToken, t.toks.小林)
      assert.ok(!JSON.stringify(ok.body).includes(code.replace(/-/g, '')), '响应不含恢复码')
      assert.ok(!logs.join('\n').includes(code.replace(/-/g, '')), '日志不含恢复码')
      const fresh = await get(t.slug, ok.body.identity.memberToken)
      assert.equal(fresh.me.role, 'organizer')
      assert.equal((await get(t.slug, t.toks.小林)).me.role, 'organizer', '旧设备 token 保持有效')
      assert.equal(fresh.activity[0].text, '小林在新设备上恢复了发起人身份')
    })

    it('暴力尝试被数据库级限流（同 IP 15 分钟 5 次），返回 429 与 Retry-After', async () => {
      const t = await setupTrip([])
      const ip = { 'x-forwarded-for': '198.51.100.23' }
      const statuses: number[] = []
      let last: Awaited<ReturnType<typeof call>> | null = null
      for (let i = 0; i < 6; i++) {
        last = await call('POST', `/api/trips/${t.slug}/recover-organizer`, { recoveryCode: `ZZZZ-ZZZZ-ZZZZ-ZZZ${i + 2}` }, undefined, ip)
        statuses.push(last.status)
      }
      assert.deepEqual(statuses, [403, 403, 403, 403, 403, 429])
      assert.ok(Number(last!.headers.get('retry-after')) > 0)
      // 达到上限后正确的恢复码也会被拒绝（直到窗口结束）
      const blocked = await call('POST', `/api/trips/${t.slug}/recover-organizer`, { recoveryCode: t.created.recovery.code }, undefined, ip)
      assert.equal(blocked.status, 429)
      const keys = await db!.query('SELECT bucket_key FROM rate_limits')
      assert.ok(!JSON.stringify(keys).includes('198.51.100.23'), '限流表不保存原始 IP')
    })

    it('发起人可以重新生成恢复码，旧码失效；普通成员不能', async () => {
      const t = await setupTrip(['阿哲'])
      assert.equal((await call('POST', `/api/trips/${t.slug}/recovery-code`, undefined, t.toks.阿哲)).status, 403)
      const r = await call('POST', `/api/trips/${t.slug}/recovery-code`, undefined, t.toks.小林)
      assert.equal(r.status, 200)
      const old = await call('POST', `/api/trips/${t.slug}/recover-organizer`, { recoveryCode: t.created.recovery.code })
      assert.equal(old.status, 403)
      const neu = await call('POST', `/api/trips/${t.slug}/recover-organizer`, { recoveryCode: r.body.recovery.code })
      assert.equal(neu.status, 200)
    })
  })

  describe('邀请码管理', () => {
    it('轮换后旧码失效、新码可用；已加入成员不受影响', async () => {
      const t = await setupTrip(['阿哲'])
      const v = await get(t.slug, t.toks.小林)
      const r = await call('PATCH', `/api/trips/${t.slug}/invite`, { action: 'regenerate', expectedInviteVersion: v.admin!.inviteVersion }, t.toks.小林)
      assert.equal(r.status, 200)
      assert.match(r.body.invite.url, /#code=[A-Z0-9]{8}$/)
      const oldJoin = await call('POST', `/api/trips/${t.slug}/join`, { displayName: '新人1', inviteCode: t.created.invite.code })
      assert.equal(oldJoin.body.error.code, 'INVALID_INVITE_CODE')
      assert.equal((await call('POST', `/api/trips/${t.slug}/join`, { displayName: '新人1', inviteCode: r.body.invite.code })).status, 201)
      assert.equal((await call('GET', `/api/trips/${t.slug}`, undefined, t.toks.阿哲)).status, 200)
      const evs = (await get(t.slug, t.toks.小林)).activity.map((a) => a.text)
      assert.ok(evs.includes('小林更新了邀请码，旧邀请码已失效'))
      assert.ok(!JSON.stringify(evs).includes(r.body.invite.code))
    })

    it('暂停期间无法加入，恢复后可以；过期拒绝；并发更新 409；普通成员 403', async () => {
      const t = await setupTrip(['阿哲'])
      let v = (await get(t.slug, t.toks.小林)).admin!.inviteVersion
      const paused = await call<{ view: TripView }>('PATCH', `/api/trips/${t.slug}/invite`, { action: 'pause', expectedInviteVersion: v }, t.toks.小林)
      assert.equal(paused.body.view.trip.inviteStatus, 'paused')
      assert.equal((await call('GET', `/api/trips/${t.slug}/public`)).body.trip.inviteStatus, 'paused')
      const j1 = await call('POST', `/api/trips/${t.slug}/join`, { displayName: '新人2', inviteCode: t.created.invite.code })
      assert.equal(j1.status, 403)
      assert.equal(j1.body.error.code, 'INVITE_PAUSED')
      // 用旧版本号再改：409
      const stale = await call('PATCH', `/api/trips/${t.slug}/invite`, { action: 'resume', expectedInviteVersion: v }, t.toks.小林)
      assert.equal(stale.status, 409)
      assert.equal(stale.body.error.code, 'VERSION_CONFLICT')
      v = paused.body.view.admin!.inviteVersion
      const both = await Promise.all([
        call('PATCH', `/api/trips/${t.slug}/invite`, { action: 'resume', expectedInviteVersion: v }, t.toks.小林),
        call('PATCH', `/api/trips/${t.slug}/invite`, { action: 'resume', expectedInviteVersion: v }, t.toks.小林),
      ])
      assert.deepEqual(both.map((b) => b.status).sort(), [200, 409], '并发修改只有一个成功')
      assert.equal((await call('POST', `/api/trips/${t.slug}/join`, { displayName: '新人2', inviteCode: t.created.invite.code })).status, 201)
      assert.equal((await call('PATCH', `/api/trips/${t.slug}/invite`, { action: 'pause', expectedInviteVersion: v + 1 }, t.toks.阿哲)).status, 403)
      const past = await call('PATCH', `/api/trips/${t.slug}/invite`, { action: 'deadline', inviteDeadline: '2020-01-01T00:00:00Z', expectedInviteVersion: v + 1 }, t.toks.小林)
      assert.equal(past.status, 400, '不能设置过去的截止时间')
      await db!.query(`UPDATE trips SET invite_deadline = now() - interval '1 minute' WHERE slug = $1 RETURNING id`, [t.slug])
      const exp = await call('POST', `/api/trips/${t.slug}/join`, { displayName: '新人3', inviteCode: t.created.invite.code })
      assert.equal(exp.status, 410)
      assert.equal(exp.body.error.code, 'INVITE_EXPIRED')
    })
  })

  describe('实际费用台账', () => {
    it('锁定前不能记账；均摊余数、部分成员、自定义金额校验、修改、软删除', async () => {
      const t0 = await setupTrip(['阿哲'])
      const pre = await call('POST', `/api/trips/${t0.slug}/expenses`, { title: '车票', category: 'transport', amountCents: 1000, paidBy: t0.ids.小林, split: { splitMethod: 'equal_all' } }, t0.toks.小林)
      assert.equal(pre.status, 409)
      assert.equal(pre.body.error.code, 'NOT_LOCKED')

      const t = await setupTrip(['阿哲', '糖糖'], { lock: true })
      const add = await call<TripView>('POST', `/api/trips/${t.slug}/expenses`, { title: '毕业晚宴', category: 'food', amountCents: 10000, paidBy: t.ids.阿哲, split: { splitMethod: 'equal_all' } }, t.toks.阿哲)
      assert.equal(add.status, 201)
      const e1 = add.body.ledger.expenses[0]
      assert.deepEqual(e1.shares.map((s) => s.shareCents).sort((a, b) => b - a), [3334, 3333, 3333])
      assert.equal(e1.shares.reduce((s, x) => s + x.shareCents, 0), 10000)
      assert.equal(add.body.activity[0].text, '阿哲新增费用“毕业晚宴 ¥100”')

      const sel = await call<TripView>('POST', `/api/trips/${t.slug}/expenses`, { title: '奶茶', category: 'other', amountCents: 2501, paidBy: t.ids.糖糖, split: { splitMethod: 'equal_selected', memberIds: [t.ids.糖糖, t.ids.小林] } }, t.toks.糖糖)
      assert.equal(sel.status, 201)
      assert.deepEqual(sel.body.ledger.expenses[0].shares.map((s) => s.shareCents).sort(), [1250, 1251])

      const bad = await call('POST', `/api/trips/${t.slug}/expenses`, { title: '门票', category: 'ticket', amountCents: 9000, paidBy: t.ids.小林, split: { splitMethod: 'custom', shares: [{ memberId: t.ids.小林, shareCents: 5000 }, { memberId: t.ids.阿哲, shareCents: 3000 }] } }, t.toks.小林)
      assert.equal(bad.status, 400)
      assert.match(bad.body.error.message, /不一致/)
      const custom = await call<TripView>('POST', `/api/trips/${t.slug}/expenses`, { title: '门票', category: 'ticket', amountCents: 9000, paidBy: t.ids.小林, split: { splitMethod: 'custom', shares: [{ memberId: t.ids.小林, shareCents: 5000 }, { memberId: t.ids.阿哲, shareCents: 4000 }] } }, t.toks.小林)
      assert.equal(custom.status, 201)

      const L = custom.body.ledger
      assert.equal(L.totalCents, 10000 + 2501 + 9000)
      const net = Object.fromEntries(L.balances.map((b) => [b.displayName, b.netCents]))
      assert.equal(Object.values(net).reduce((s, x) => s + x, 0), 0)
      // 转账后结清
      const after = { ...net }
      for (const tr of L.transfers) {
        after[tr.fromName] += tr.cents
        after[tr.toName] -= tr.cents
      }
      assert.ok(Object.values(after).every((x) => x === 0))

      // 非记录人/垫付人/发起人不能修改；旧版本 409；正确修改
      const e2 = L.expenses.find((e) => e.title === '奶茶')!
      const deny = await call('PATCH', `/api/trips/${t.slug}/expenses/${e2.id}`, { title: '奶茶', category: 'other', amountCents: 2000, paidBy: t.ids.糖糖, split: { splitMethod: 'equal_all' }, expectedVersion: e2.version }, t.toks.阿哲)
      assert.equal(deny.status, 403)
      const upd = await call<TripView>('PATCH', `/api/trips/${t.slug}/expenses/${e2.id}`, { title: '奶茶', category: 'other', amountCents: 3000, paidBy: t.ids.糖糖, split: { splitMethod: 'equal_all' }, expectedVersion: e2.version }, t.toks.糖糖)
      assert.equal(upd.status, 200)
      const e2b = upd.body.ledger.expenses.find((e) => e.id === e2.id)!
      assert.equal(e2b.amountCents, 3000)
      assert.equal(e2b.shares.length, 3)
      const stale = await call('PATCH', `/api/trips/${t.slug}/expenses/${e2.id}`, { title: '奶茶', category: 'other', amountCents: 3100, paidBy: t.ids.糖糖, split: { splitMethod: 'equal_all' }, expectedVersion: e2.version }, t.toks.糖糖)
      assert.equal(stale.status, 409)

      // 软删除后余额重算，数据库保留记录
      const del = await call<TripView>('DELETE', `/api/trips/${t.slug}/expenses/${e2.id}`, { expectedVersion: e2b.version }, t.toks.小林)
      assert.equal(del.status, 200)
      assert.equal(del.body.ledger.totalCents, 10000 + 9000)
      assert.ok(!del.body.ledger.expenses.some((e) => e.id === e2.id))
      const row = await db!.query('SELECT deleted_at IS NOT NULL AS deleted FROM expenses WHERE id = $1::uuid', [e2.id])
      assert.equal(row[0].deleted, true)
      assert.equal((await call('DELETE', `/api/trips/${t.slug}/expenses/${e2.id}`, { expectedVersion: e2b.version + 1 }, t.toks.小林)).status, 404)
    })

    it('退出成员的历史垫付与分摊保留在账单中', async () => {
      const t = await setupTrip(['阿哲', '糖糖'], { lock: true })
      await call('POST', `/api/trips/${t.slug}/expenses`, { title: '民宿', category: 'stay', amountCents: 60000, paidBy: t.ids.糖糖, split: { splitMethod: 'equal_all' } }, t.toks.糖糖)
      assert.equal((await call('POST', `/api/trips/${t.slug}/leave`, undefined, t.toks.糖糖)).body.status, 'left')
      const L = (await get(t.slug, t.toks.小林)).ledger
      const tang = L.balances.find((b) => b.displayName === '糖糖')!
      assert.equal(tang.left, true)
      assert.equal(tang.paidCents, 60000)
      assert.equal(tang.netCents, 40000)
      assert.equal(L.transfers.reduce((s, x) => s + (x.toName === '糖糖' ? x.cents : 0), 0), 40000)
      // 退出者不能再被选为新费用的垫付人
      const r = await call('POST', `/api/trips/${t.slug}/expenses`, { title: 'x', category: 'other', amountCents: 100, paidBy: t.ids.糖糖, split: { splitMethod: 'equal_all' } }, t.toks.小林)
      assert.equal(r.status, 400)
    })

    it('无权限：非成员 401；其他旅行局的成员和费用 ID 不能越权', async () => {
      const a = await setupTrip(['阿哲'], { lock: true })
      const b = await setupTrip(['路人'], { lock: true })
      const add = await call<TripView>('POST', `/api/trips/${a.slug}/expenses`, { title: '车费', category: 'local', amountCents: 500, paidBy: a.ids.小林, split: { splitMethod: 'equal_all' } }, a.toks.小林)
      const eid = add.body.ledger.expenses[0].id
      assert.equal((await call('POST', `/api/trips/${a.slug}/expenses`, { title: 'x', category: 'other', amountCents: 100, paidBy: a.ids.小林, split: { splitMethod: 'equal_all' } })).status, 401)
      // b 的发起人拿着自己的 token 去改 a 的费用：在 a 中认证失败
      assert.equal((await call('DELETE', `/api/trips/${a.slug}/expenses/${eid}`, { expectedVersion: 0 }, b.toks.小林)).status, 401)
      // b 的发起人在 b 的地址下引用 a 的费用 ID：不属于 b，404
      assert.equal((await call('DELETE', `/api/trips/${b.slug}/expenses/${eid}`, { expectedVersion: 0 }, b.toks.小林)).status, 404)
      // 把 b 的成员塞进 a 的分摊：400
      const x = await call('POST', `/api/trips/${a.slug}/expenses`, { title: 'x', category: 'other', amountCents: 100, paidBy: a.ids.小林, split: { splitMethod: 'equal_selected', memberIds: [b.ids.路人] } }, a.toks.小林)
      assert.equal(x.status, 400)
    })
  })

  describe('动态脱敏与兼容', () => {
    it('动态与限流表中没有 token、邀请码、恢复码或偏好原文', async () => {
      const t = await setupTrip(['阿哲'], { lock: true })
      await call('PUT', `/api/trips/${t.slug}/preferences/me`, P({ budgetId: 'b5', nos: ['红眼航班或夜车'], musts: ['每天睡够7小时'] }), t.toks.阿哲)
      const rows = await db!.query('SELECT type, payload FROM activity_events WHERE trip_id = (SELECT id FROM trips WHERE slug = $1)', [t.slug])
      const dump = JSON.stringify(rows)
      for (const secret of [t.toks.小林, t.toks.阿哲, t.created.invite.code, t.created.recovery.code.replace(/-/g, ''), 'b5', '红眼航班或夜车', '每天睡够7小时', '"budgetId"']) {
        assert.ok(!dump.includes(secret), `泄漏：${secret}`)
      }
      const v = await get(t.slug, t.toks.阿哲)
      assert.ok(v.activity.some((a) => a.text === '阿哲修改了偏好'))
      assert.equal(v.admin, null, '普通成员看不到管理信息')
    })

    it('阶段二客户端：旧字段与旧接口保持可用，revision 单调递增', async () => {
      const t = await setupTrip(['阿哲'])
      const v1 = await get(t.slug, t.toks.阿哲)
      for (const k of ['trip', 'me', 'members', 'filledCount', 'consensus', 'lockedPlan', 'state', 'revision', 'serverTime']) assert.ok(k in v1, k)
      const l = await call<TripView>('POST', `/api/trips/${t.slug}/lock`, { planId: v1.consensus.plans[0].id, expectedVersion: v1.state.version }, t.toks.小林)
      assert.ok(l.body.revision > v1.revision)
      const p = await call<TripView>('PATCH', `/api/trips/${t.slug}/invite`, { action: 'pause', expectedInviteVersion: 0 }, t.toks.小林)
      assert.ok((p.body as unknown as { view: TripView }).view.revision > l.body.revision, '邀请设置变化也推进 revision')
    })
  })
})
