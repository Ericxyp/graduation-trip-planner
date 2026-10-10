/**
 * 阶段三单元测试（不需要数据库）：金额、分摊、最少转账、任务重分配、动态脱敏、限流 key。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { activityText, sanitizePayload } from '../src/shared/activity.js'
import { computeBalances, formatCents, minTransfers, parseYuanToCents, splitEqual } from '../src/shared/ledger.js'
import { expenseCreateSchema, inviteSchema, recoverSchema } from '../src/shared/schemas.js'
import { bucketKey } from '../server/limits.js'
import { hashSecret, newRecoveryCode, verifySecret } from '../server/security.js'
import { reassignTasks } from '../server/service.js'
import { splitSql } from '../server/sql.js'
import { readFileSync } from 'node:fs'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'

describe('金额：整数分，不使用浮点', () => {
  it('解析人民币字符串', () => {
    assert.equal(parseYuanToCents('186.5'), 18650)
    assert.equal(parseYuanToCents('¥1,234.56'), 123456)
    assert.equal(parseYuanToCents('0.1'), 10)
    assert.equal(parseYuanToCents('0.07'), 7)
    assert.equal(parseYuanToCents(' 680 '), 68000)
    for (const bad of ['', 'abc', '1.234', '-5', '1e3', '12345678']) assert.equal(parseYuanToCents(bad), null, bad)
  })
  it('经典浮点陷阱：0.1 + 0.2 元在分上精确相加', () => {
    assert.equal(parseYuanToCents('0.1')! + parseYuanToCents('0.2')!, 30)
  })
  it('格式化', () => {
    assert.equal(formatCents(18650), '¥186.50')
    assert.equal(formatCents(68000), '¥680')
    assert.equal(formatCents(-9200), '−¥92')
    assert.equal(formatCents(123456789), '¥1,234,567.89')
  })
})

describe('均摊与余数', () => {
  it('100 分 3 人：34/33/33，余数按顺序给前面的人', () => {
    assert.deepEqual([...splitEqual(100, ['x', 'y', 'z']).values()], [34, 33, 33])
  })
  it('任意金额分摊后合计等于总额，且每人差额不超过 1 分', () => {
    for (const amt of [1, 7, 99, 1000, 18650, 9999999]) {
      for (let n = 1; n <= 9; n++) {
        const ids = Array.from({ length: n }, (_, i) => `m${i}`)
        const v = [...splitEqual(amt, ids).values()]
        assert.equal(v.reduce((s, x) => s + x, 0), amt)
        assert.ok(Math.max(...v) - Math.min(...v) <= 1)
        assert.ok(v.every(Number.isInteger))
      }
    }
  })
  it('拒绝非正、非整数金额', () => {
    assert.throws(() => splitEqual(0, ['a']))
    assert.throws(() => splitEqual(10.5, ['a']))
    assert.throws(() => splitEqual(100, []))
  })
})

describe('余额与最少转账', () => {
  it('计算每人垫付、应付、净额', () => {
    const b = computeBalances(
      [
        { id: 'e1', amountCents: 30000, paidBy: 'lin', shares: [{ memberId: 'lin', shareCents: 10000 }, { memberId: 'tang', shareCents: 10000 }, { memberId: 'zhe', shareCents: 10000 }] },
        { id: 'e2', amountCents: 6000, paidBy: 'tang', shares: [{ memberId: 'lin', shareCents: 3000 }, { memberId: 'zhe', shareCents: 3000 }] },
      ],
      ['lin', 'tang', 'zhe'],
    )
    assert.deepEqual(b.map((x) => [x.memberId, x.paidCents, x.owedCents, x.netCents]), [
      ['lin', 30000, 13000, 17000],
      ['tang', 6000, 10000, -4000],
      ['zhe', 0, 13000, -13000],
    ])
    const t = minTransfers(b)
    assert.deepEqual(t, [
      { from: 'zhe', to: 'lin', cents: 13000 },
      { from: 'tang', to: 'lin', cents: 4000 },
    ])
  })
  it('转账后所有人结清，且笔数 ≤ 有余额人数 − 1', () => {
    let seed = 7
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let round = 0; round < 200; round++) {
      const ids = Array.from({ length: 2 + Math.floor(rand() * 7) }, (_, i) => `p${i}`)
      const expenses = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, k) => {
        const amt = 1 + Math.floor(rand() * 100000)
        const who = ids.filter(() => rand() > 0.3)
        const sharers = who.length ? who : [ids[0]]
        return { id: `e${k}`, amountCents: amt, paidBy: ids[Math.floor(rand() * ids.length)], shares: [...splitEqual(amt, sharers)].map(([memberId, shareCents]) => ({ memberId, shareCents })) }
      })
      const bal = computeBalances(expenses, ids)
      const tr = minTransfers(bal)
      const net = new Map(bal.map((b) => [b.memberId, b.netCents]))
      for (const t of tr) {
        net.set(t.from, net.get(t.from)! + t.cents)
        net.set(t.to, net.get(t.to)! - t.cents)
        assert.ok(t.cents > 0 && Number.isInteger(t.cents))
      }
      assert.ok([...net.values()].every((v) => v === 0), '全部结清')
      const nonZero = bal.filter((b) => b.netCents !== 0).length
      assert.ok(tr.length <= Math.max(nonZero - 1, 0))
    }
  })
  it('净额之和不为 0 时拒绝计算', () => {
    assert.throws(() => minTransfers([{ memberId: 'a', netCents: 5 }]))
  })
})

describe('任务重新分配', () => {
  it('只移动退出者的任务，给当前任务最少的人', () => {
    const r = reassignTasks({ t1: 'a', t2: 'b', t3: 'c', t4: 'c', t5: 'a' }, 'c', ['a', 'b', 'c'])
    assert.equal(r.moved, 2)
    assert.equal(r.next.t1, 'a')
    assert.equal(r.next.t2, 'b')
    assert.equal(r.next.t5, 'a')
    const counts = Object.values(r.next).reduce<Record<string, number>>((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {})
    assert.ok(!('c' in counts))
    assert.ok(Math.abs(counts.a - counts.b) <= 1)
  })
  it('没有可接手的人时清空其任务', () => {
    const r = reassignTasks({ t1: 'c' }, 'c', ['c'])
    assert.deepEqual(r.next, {})
  })
})

describe('动态脱敏', () => {
  it('只保留白名单字段，丢弃 token / 邀请码 / 偏好等', () => {
    const p = sanitizePayload('member_joined', { actor: '阿哲', token: 'secret-token', inviteCode: 'ABCD2345', budgetId: 'b4', nos: ['红眼'] })
    assert.deepEqual(p, { actor: '阿哲' })
    const e = sanitizePayload('expense_added', { actor: '糖糖', title: '毕业晚宴', cents: 68000, recoveryCode: 'X' })
    assert.deepEqual(e, { actor: '糖糖', title: '毕业晚宴', cents: 68000 })
  })
  it('文案面向普通用户', () => {
    assert.equal(activityText('member_joined', { actor: '阿哲' }), '阿哲加入了旅行局')
    assert.equal(activityText('plan_locked', { actor: '小林', destination: '成都' }), '小林锁定了成都方案')
    assert.equal(activityText('expense_added', { actor: '糖糖', title: '毕业晚宴', cents: 68000 }), '糖糖新增费用“毕业晚宴 ¥680”')
    assert.equal(activityText('prefs_updated', { actor: '阿哲' }), '阿哲修改了偏好')
  })
})

describe('恢复码与限流 key', () => {
  it('恢复码 16 位，哈希域独立，格式化输入可校验', () => {
    const code = newRecoveryCode()
    assert.match(code, /^[A-HJ-NP-Z2-9]{16}$/)
    const h = hashSecret(code, 'pepper', 'recovery')
    const typed = recoverSchema.parse({ recoveryCode: ` ${code.slice(0, 4).toLowerCase()}-${code.slice(4, 8)} ${code.slice(8)} ` }).recoveryCode
    assert.ok(verifySecret(typed, h, 'pepper', 'recovery'))
    assert.ok(!verifySecret(typed, h, 'pepper', 'token'))
  })
  it('限流 key 是 HMAC，不包含原始 IP 或标识', () => {
    const k = bucketKey('pepper', 'join:ip-trip', '203.0.113.7|trip-uuid')
    assert.match(k, /^[0-9a-f]{64}$/)
    assert.ok(!k.includes('203.0.113.7') && !k.includes('trip-uuid'))
    assert.notEqual(k, bucketKey('other-pepper', 'join:ip-trip', '203.0.113.7|trip-uuid'))
  })
})

describe('阶段三输入校验', () => {
  it('费用金额必须是正整数分；分摊方式需匹配字段', () => {
    const base = { title: '晚饭', category: 'food', amountCents: 1000, paidBy: A }
    assert.ok(expenseCreateSchema.safeParse({ ...base, split: { splitMethod: 'equal_all' } }).success)
    assert.ok(!expenseCreateSchema.safeParse({ ...base, amountCents: 10.5, split: { splitMethod: 'equal_all' } }).success)
    assert.ok(!expenseCreateSchema.safeParse({ ...base, amountCents: 0, split: { splitMethod: 'equal_all' } }).success)
    assert.ok(!expenseCreateSchema.safeParse({ ...base, split: { splitMethod: 'custom' } }).success)
    assert.ok(expenseCreateSchema.safeParse({ ...base, split: { splitMethod: 'custom', shares: [{ memberId: A, shareCents: 600 }, { memberId: B, shareCents: 400 }] } }).success)
    assert.ok(!expenseCreateSchema.safeParse({ ...base, tripId: 'x', split: { splitMethod: 'equal_all' } }).success, '拒绝 tripId 等多余字段')
  })
  it('邀请操作必须携带 expectedInviteVersion', () => {
    assert.ok(!inviteSchema.safeParse({ action: 'pause' }).success)
    assert.ok(inviteSchema.safeParse({ action: 'pause', expectedInviteVersion: 0 }).success)
  })
})

describe('迁移文件', () => {
  it('002 与部署后 003 可拆分为独立语句，且不修改 001', () => {
    const s2 = splitSql(readFileSync('db/migrations/002_stage_three.sql', 'utf8'))
    assert.ok(s2.length >= 15)
    assert.ok(s2.every((x) => /IF (NOT )?EXISTS/i.test(x)), '002 每条语句都是幂等写法')
    assert.ok(!s2.some((x) => /DROP CONSTRAINT/i.test(x)), '002 不删除阶段二约束（保持线上兼容）')
    const s3 = splitSql(readFileSync('db/migrations/post-deploy/003_drop_legacy_name_unique.sql', 'utf8'))
    assert.ok(s3.every((x) => /IF (NOT )?EXISTS/i.test(x)))
  })
})
