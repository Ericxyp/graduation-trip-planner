import { AlertCircle, CircleDollarSign, Crown, HandCoins, Info, PiggyBank, ReceiptText, RotateCcw, TrendingUp, Wallet } from 'lucide-react'
import { MEMBERS, memberById } from '../data'
import { categoryPerPerson, perPersonFor, yuan, type SchemeStats } from '../logic'
import type { CostItem, MemberId, Scheme } from '../types'
import Avatar from './Avatar'

interface Props {
  scheme: Scheme
  stats: SchemeStats
  exited: MemberId[]
  paid: MemberId[]
  isLocked: boolean
  onToggleExit: (id: MemberId, name: string) => void
  onTogglePaid: (id: MemberId, name: string) => void
  onRestoreAll: () => void
}

const CAT_COLOR: Record<CostItem['key'], string> = {
  transport: '#FF6B4A',
  stay: '#3D97D6',
  food: '#E0A43A',
  ticket: '#5E9F7A',
  local: '#B86FB0',
  reserve: '#A3A8B8',
}

export default function Settlement({ scheme, stats, exited, paid, isLocked, onToggleExit, onTogglePaid, onRestoreAll }: Props) {
  const all = stats.participants
  const active = all.filter((id) => !exited.includes(id))
  const n0 = all.length
  const n = active.length
  const base = perPersonFor(scheme.costs, n0)
  const now = perPersonFor(scheme.costs, n)
  const increase = now - base
  const total = now * n
  const paidActive = paid.filter((id) => active.includes(id))
  const paidAmount = paidActive.length * base
  const pending = total - paidAmount
  const sharedTotal = scheme.costs.reduce((s, c) => s + c.shared, 0)
  const canExitMore = n > 2

  const kpis = [
    { label: '团队总预算', value: yuan(total), sub: `${n}人 × ${yuan(now)}`, icon: ReceiptText },
    { label: '人均预算', value: yuan(now), sub: increase > 0 ? `较原方案 +${yuan(increase)}` : `${n}人均摊`, icon: Wallet, warn: increase > 0 },
    { label: '已支付', value: yuan(paidAmount), sub: `${paidActive.length}人已付`, icon: CircleDollarSign },
    { label: '待支付', value: yuan(pending), sub: pending > 0 ? `${n - paidActive.length}人待付${increase > 0 && paidActive.length ? '，含补差' : ''}` : '已全部结清', icon: HandCoins },
  ]

  return (
    <section id="settle" className="pt-14 sm:pt-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="section-eyebrow">
            <PiggyBank className="h-3.5 w-3.5" />
            Split the bill
          </span>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-[28px]">费用透明，AA 不尴尬</h2>
          <p className="mt-2 text-sm text-ink-500">
            {scheme.city}方案 · 个人费用按人计，住宿、包车、聚餐等公共费用由同行成员均摊
            {!isLocked && '（锁定方案后生效）'}
          </p>
        </div>
      </div>

      {/* KPI */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <div key={k.label} className="card p-4 sm:p-5">
              <p className="flex items-center gap-1.5 text-xs text-ink-500">
                <Icon className="h-3.5 w-3.5" />
                {k.label}
              </p>
              <p className="num mt-2 text-[22px] font-black tracking-tight text-ink-900 sm:text-[26px]">{k.value}</p>
              <p className={`mt-1 text-xs ${k.warn ? 'font-semibold text-coral-600' : 'text-ink-400'}`}>{k.sub}</p>
            </div>
          )
        })}
      </div>

      {exited.length > 0 && (
        <div role="alert" className="mt-4 flex animate-slide-up flex-col gap-3 rounded-3xl bg-coral-50 p-5 ring-1 ring-coral-200 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-coral-500 text-white">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-coral-700">
              成员退出后，每位成员预计增加 <span className="num">{yuan(increase)}</span>。
            </p>
            <p className="mt-1 text-[13px] leading-6 text-ink-600">
              {exited.map((id) => memberById(id).name).join('、')} 退出后，公共费用 {yuan(sharedTotal)} 由剩余 {n} 人分摊，人均由 {yuan(base)} 调整为 {yuan(now)}。
              {paidActive.length > 0 && `已付款的 ${paidActive.length} 人需各补 ${yuan(increase)}。`}
            </p>
          </div>
          <button onClick={onRestoreAll} className="btn-ghost shrink-0 self-start text-sm sm:self-auto">
            <RotateCcw className="h-4 w-4" />
            恢复全部成员
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        {/* 预算构成 */}
        <div className="card p-5 sm:p-6">
          <h3 className="text-base font-bold text-ink-900">预算构成</h3>
          <p className="mt-1 text-xs text-ink-400">人均 {yuan(now)}，按类别拆分</p>
          <div className="mt-4 flex h-3.5 overflow-hidden rounded-full bg-cream-200" role="img" aria-label="预算构成比例">
            {scheme.costs.map((c) => (
              <span
                key={c.key}
                className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(categoryPerPerson(c, n) / now) * 100}%`, backgroundColor: CAT_COLOR[c.key] }}
              />
            ))}
          </div>
          <ul className="mt-5 divide-y divide-dashed divide-cream-300">
            {scheme.costs.map((c) => {
              const v = categoryPerPerson(c, n)
              const d = v - categoryPerPerson(c, n0)
              return (
                <li key={c.key} className="flex items-center gap-3 py-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CAT_COLOR[c.key] }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-800">
                      {c.label}
                      {c.shared > 0 && <span className="ml-1.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">均摊</span>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-400">{c.note}</p>
                  </div>
                  <div className="text-right">
                    <p className="num text-sm font-bold text-ink-800">{yuan(v)}</p>
                    <p className="num text-[11px] text-ink-400">
                      {d > 0 ? <span className="font-semibold text-coral-600">+{yuan(d)}</span> : `${Math.round((v / now) * 100)}%`}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* 成员明细 */}
        <div className="card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-ink-900">成员AA明细</h3>
              <p className="mt-1 text-xs text-ink-400">打开“临时退出”，模拟有人来不了时的费用变化</p>
            </div>
            <span className="num shrink-0 rounded-full bg-cream-100 px-2.5 py-1 text-xs font-semibold text-ink-600">
              {n}/{n0} 人
            </span>
          </div>

          <ul className="mt-4 space-y-2">
            {all.map((id) => {
              const m = memberById(id)
              const out = exited.includes(id)
              const isPaid = paid.includes(id)
              const exitDisabled = m.isOrganizer || (!out && !canExitMore)
              let status: { text: string; cls: string }
              if (out) status = isPaid ? { text: `待退款 ${yuan(base)}`, cls: 'text-sky-700 bg-sky-50' } : { text: '已退出', cls: 'text-ink-500 bg-cream-100' }
              else if (isPaid && increase > 0) status = { text: `待补 ${yuan(increase)}`, cls: 'text-coral-700 bg-coral-50' }
              else if (isPaid) status = { text: '已付清', cls: 'text-emerald-700 bg-emerald-50' }
              else status = { text: '待支付', cls: 'text-amber-700 bg-amber-50' }

              return (
                <li key={id} className={`flex items-center gap-2 rounded-2xl p-2 transition sm:gap-3 sm:p-2.5 ${out ? 'bg-cream-50' : 'hover:bg-cream-50'}`}>
                  <span className="hidden min-[400px]:inline-flex">
                    <Avatar id={id} size="md" dim={out} ring={false} />
                  </span>
                  <span className="inline-flex min-[400px]:hidden">
                    <Avatar id={id} size="sm" dim={out} ring={false} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`flex items-center gap-1 text-sm font-semibold ${out ? 'text-ink-400 line-through' : 'text-ink-800'}`}>
                      {m.name}
                      {m.isMe && <span className="text-xs font-medium text-coral-600 no-underline">（我）</span>}
                      {m.isOrganizer && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="num text-xs text-ink-500">{out ? '不计入分摊' : `应付 ${yuan(now)}`}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${status.cls}`}>{status.text}</span>
                    </div>
                  </div>
                  {!out && (
                    <button
                      onClick={() => onTogglePaid(id, m.name)}
                      className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 ${
                        isPaid ? 'text-ink-500 hover:bg-cream-200' : 'bg-ink-800 text-white hover:bg-ink-700'
                      }`}
                    >
                      {isPaid ? '撤销' : '标记已付'}
                    </button>
                  )}
                  <div className={`flex shrink-0 flex-col items-center gap-1 ${exitDisabled ? 'opacity-40' : 'cursor-pointer'}`} title={m.isOrganizer ? '发起人负责订单，不可退出' : !canExitMore && !out ? '至少保留2位成员' : ''}>
                    <button
                      role="switch"
                      aria-checked={out}
                      aria-label={`${m.name} 临时退出`}
                      disabled={exitDisabled}
                      onClick={() => onToggleExit(id, m.name)}
                      className={`relative h-6 w-11 rounded-full transition ${out ? 'bg-coral-500' : 'bg-cream-300'}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${out ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                    <span className="text-[10px] text-ink-400">临时退出</span>
                  </div>
                </li>
              )
            })}
          </ul>

          {MEMBERS.length > n0 && (
            <p className="mt-4 flex items-start gap-1.5 text-xs leading-5 text-ink-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {MEMBERS.filter((m) => !all.includes(m.id))
                .map((m) => m.name)
                .join('、')}
              未参加本方案，不计入分摊。
            </p>
          )}
          {!canExitMore && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <AlertCircle className="h-3.5 w-3.5" />
              至少需要保留2位成员，行程才能成行
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
