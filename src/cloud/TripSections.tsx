import { useId, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Calculator,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Info,
  Lock,
  MapPin,
  PenLine,
  Route,
  Sparkles,
  ThumbsUp,
  Unlock,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { fmtMonthDay, weekdayOf } from '../shared/dates'
import { PACE_LABEL } from '../shared/options'
import type { ConsensusView, MemberSummary, PlanView, SharedState } from '../shared/types'
import { MATCH_DIMENSIONS, MATCH_WEIGHTS, WEIGHT_TOTAL } from '../shared/weights'
import { MemberDot } from './ui'

const yuan = (n: number) => `¥${Math.round(n).toLocaleString('zh-CN')}`

/* ---------------- 共识方案 ---------------- */

export function ConsensusSection(p: {
  consensus: ConsensusView
  locked: PlanView | null
  selectedId: string | null
  onSelect: (id: string) => void
  isOrganizer: boolean
  hasMine: boolean
  readOnly: boolean
  busy: boolean
  onLock: (id: string) => void
  onUnlock: () => void
  onFill: () => void
  onInvite: () => void
}) {
  const [methodOpen, setMethodOpen] = useState(false)
  const c = p.consensus

  return (
    <section id="consensus" className="pt-12 sm:pt-16" aria-labelledby="consensus-title">
      <span className="section-eyebrow">
        <Sparkles className="h-3.5 w-3.5" />
        AI共识分析
      </span>
      <h2 id="consensus-title" className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-[28px]">
        共识方案
      </h2>
      <p className="mt-2 text-sm text-ink-500">
        由服务端规则引擎基于 <span className="num font-semibold text-ink-700">{c.filledCount}</span> 位成员的私密偏好计算，所有成员看到的是同一份结果
      </p>

      {c.status === 'need_more' ? (
        <div className="card mt-6 flex flex-col items-center p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
            <Users className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-lg font-extrabold text-ink-900">{c.filledCount === 0 ? '还没有人填写偏好' : '只有 1 人填写，暂不能形成共识'}</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-ink-500">至少需要 2 位成员填写偏好，系统才会生成可比较的共识方案。</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {!p.hasMine && (
              <button onClick={p.onFill} disabled={p.readOnly} className="btn-primary px-5 py-2.5 text-sm">
                <PenLine className="h-4 w-4" />
                填写我的偏好
              </button>
            )}
            <button onClick={p.onInvite} className="btn-ghost px-5 py-2.5 text-sm">
              <UserPlus className="h-4 w-4" />
              邀请同学
            </button>
          </div>
        </div>
      ) : (
        <PlanTabs {...p} methodOpen={methodOpen} onToggleMethod={() => setMethodOpen((v) => !v)} />
      )}
    </section>
  )
}

function PlanTabs(p: Parameters<typeof ConsensusSection>[0] & { methodOpen: boolean; onToggleMethod: () => void }) {
  const plans = p.consensus.plans
  const current = plans.find((x) => x.id === p.selectedId) ?? (p.locked && p.selectedId === p.locked.id ? p.locked : null) ?? plans[0]
  return (
    <>
      {p.locked && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200" role="status">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Lock className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-emerald-800">
              团队已锁定：{p.locked.destination} · {fmtMonthDay(p.locked.dateStart)}—{fmtMonthDay(p.locked.dateEnd)}
            </p>
            <p className="text-xs text-emerald-700/80">{p.isOrganizer ? '你可以随时取消锁定或改锁其他方案' : '由发起人锁定，行程与 AA 账单按此方案生成'}</p>
          </div>
          {p.isOrganizer && (
            <button onClick={p.onUnlock} disabled={p.busy || p.readOnly} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
              <Unlock className="h-3.5 w-3.5" />
              取消锁定
            </button>
          )}
        </div>
      )}

      <div role="tablist" aria-label="推荐方案" className={`mt-5 grid gap-2 sm:gap-4 ${plans.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {plans.map((pl, i) => {
          const active = pl.id === current.id
          return (
            <button
              key={pl.id}
              role="tab"
              aria-selected={active}
              onClick={() => p.onSelect(pl.id)}
              className={`relative overflow-hidden rounded-2xl p-3 text-left transition sm:rounded-3xl sm:p-5 ${active ? 'bg-ink-800 text-white shadow-lift' : 'bg-white text-ink-800 shadow-card ring-1 ring-ink-800/5 hover:ring-ink-800/15'}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={`font-mono text-[10px] font-semibold tracking-widest ${active ? 'text-white/50' : 'text-ink-400'}`}>PLAN {String.fromCharCode(65 + i)}</span>
                {p.locked?.id === pl.id && (
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-coral-500 text-white' : 'bg-coral-50 text-coral-700'}`}>
                    <Lock className="h-2.5 w-2.5" />
                    <span className="hidden sm:inline">已锁定</span>
                  </span>
                )}
              </div>
              <p className={`mt-1.5 text-[15px] font-extrabold sm:text-lg ${active ? 'text-white' : 'text-ink-900'}`}>{pl.label}</p>
              <p className={`mt-0.5 truncate text-xs sm:text-sm ${active ? 'text-white/70' : 'text-ink-500'}`}>{pl.destination}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className={`num text-xl font-black sm:text-2xl ${active ? 'text-coral-300' : 'text-coral-600'}`}>{pl.match}</span>
                <span className={`text-[11px] ${active ? 'text-white/60' : 'text-ink-400'}`}>% 匹配</span>
              </div>
              {active && <span className="absolute inset-x-0 bottom-0 h-1 bg-coral-500" />}
            </button>
          )
        })}
      </div>

      <div key={current.id} className="mt-4 grid animate-slide-up gap-4 lg:grid-cols-[1.35fr_1fr]">
        <PlanDetail plan={current} />
        <div className="flex flex-col gap-4">
          <ExplainCard plan={current} methodOpen={p.methodOpen} onToggleMethod={p.onToggleMethod} />
          {p.isOrganizer ? (
            p.locked?.id === current.id ? null : (
              <button onClick={() => p.onLock(current.id)} disabled={p.busy || p.readOnly || !current.feasible} className="btn-primary w-full py-4 text-[15px]">
                <Lock className="h-4 w-4" />
                {!current.feasible ? '可参加人数不足 2 人，暂不能锁定' : p.locked ? `改为锁定${current.destination}方案` : `锁定${current.destination}方案`}
              </button>
            )
          ) : (
            <p className="flex items-start gap-2 rounded-2xl bg-cream-50 p-4 text-[13px] leading-5 text-ink-500 ring-1 ring-cream-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
              团队方案由发起人锁定。你可以随时修改自己的偏好，方案会自动重新计算。
            </p>
          )}
        </div>
      </div>
    </>
  )
}

function PlanDetail({ plan }: { plan: PlanView }) {
  const r = 30
  const circ = 2 * Math.PI * r
  return (
    <article className="card overflow-hidden">
      <div className="relative bg-coral-500 px-5 pb-6 pt-5 text-white sm:px-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-semibold tracking-[0.2em] text-white/70">{plan.label.toUpperCase()} · {plan.slogan}</p>
            <h3 className="mt-1 truncate text-[34px] font-black leading-none tracking-tight sm:text-[40px]">{plan.destination}</h3>
          </div>
          <div className="relative h-[76px] w-[76px] shrink-0" aria-label={`匹配度 ${plan.match}%`}>
            <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
              <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="7" />
              <circle cx="38" cy="38" r={r} fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - plan.match / 100)} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="num text-xl font-black leading-none">{plan.match}%</span>
              <span className="mt-0.5 text-[10px] text-white/80">匹配度</span>
            </div>
          </div>
        </div>
        <p className="mt-5 flex flex-wrap items-center gap-x-2 text-sm">
          <CalendarDays className="h-4 w-4 text-white/80" />
          <span className="num font-semibold">
            {fmtMonthDay(plan.dateStart)}—{fmtMonthDay(plan.dateEnd)}
          </span>
          <span className="text-white/70">
            {weekdayOf(plan.dateStart)}出发 · {plan.days}天{Math.max(plan.days - 1, 0)}晚
          </span>
        </p>
      </div>
      <div className="px-5 pb-6 pt-5 sm:px-7">
        <dl className="grid grid-cols-3 divide-x divide-dashed divide-cream-300 rounded-2xl bg-cream-50 py-4 ring-1 ring-cream-200">
          {[
            { icon: Users, label: '可参加', value: `${plan.participantCount}/${plan.memberCount}`, unit: '人' },
            { icon: Wallet, label: '人均预算', value: yuan(plan.perPerson) },
            { icon: CalendarDays, label: '节奏', value: PACE_LABEL[plan.pace] },
          ].map((s) => (
            <div key={s.label} className="px-2 text-center">
              <dt className="flex items-center justify-center gap-1 text-[11px] text-ink-400">
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </dt>
              <dd className="mt-1">
                <span className="num text-lg font-black text-ink-900 sm:text-2xl">{s.value}</span>
                {s.unit && <span className="ml-0.5 text-[11px] text-ink-400">{s.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {plan.tags.map((t) => (
            <span key={t} className="rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
              {t}
            </span>
          ))}
          <span className="rounded-lg bg-cream-100 px-2.5 py-1 text-xs font-medium text-ink-600">{plan.stayLabel}</span>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-bold text-ink-800">
              <ThumbsUp className="h-4 w-4 text-emerald-600" />
              推荐理由
            </h4>
            <ul className="mt-3 space-y-2.5">
              {plan.reasons.map((r) => (
                <li key={r} className="flex gap-2 text-[13px] leading-6 text-ink-600">
                  <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={3} />
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-bold text-ink-800">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              主要冲突
            </h4>
            {plan.conflicts.length === 0 ? (
              <p className="mt-3 text-[13px] text-ink-500">暂无明显冲突</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {plan.conflicts.map((c) => (
                  <li key={c.title} className="rounded-xl bg-cream-50 p-3 ring-1 ring-cream-200">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-800">
                      <span className={`h-1.5 w-1.5 rounded-full ${c.level === 'high' ? 'bg-coral-500' : c.level === 'mid' ? 'bg-amber-400' : 'bg-sky-400'}`} />
                      {c.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-ink-500">{c.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="mt-6 border-t border-dashed border-cream-300 pt-5">
          <h4 className="text-sm font-bold text-ink-800">可参加成员</h4>
          {plan.participants.length ? (
            <p className="mt-2 text-[13px] leading-6 text-ink-600">{plan.participants.map((m) => m.displayName).join('、')}</p>
          ) : (
            <p className="mt-2 text-[13px] text-ink-400">暂无成员可同时出发</p>
          )}
        </div>
        {plan.myFit && (
          <div className="mt-5 rounded-2xl bg-sky-50 p-4">
            <p className="text-[13px] font-bold text-sky-700">
              与你的偏好对比 · 个人得分 {plan.myFit.score}
              {plan.myFit.vetoed && '（触发底线条件，得分减半）'}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {[
                { ok: plan.myFit.dates, label: '日期' },
                { ok: plan.myFit.budget, label: '预算' },
                { ok: plan.myFit.destRank === 1, label: plan.myFit.destRank ? `第${plan.myFit.destRank}志愿` : '目的地未选' },
                { ok: plan.myFit.pace, label: '节奏' },
                { ok: plan.myFit.stay, label: '住宿' },
                { ok: !plan.myFit.vetoed, label: '底线' },
              ].map((i) => (
                <span key={i.label} className={`inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-medium ${i.ok ? 'text-ink-700' : 'text-ink-400'}`}>
                  {i.ok ? <Check className="h-3 w-3 text-emerald-600" strokeWidth={3} /> : <X className="h-3 w-3 text-coral-500" strokeWidth={3} />}
                  {i.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function ExplainCard({ plan, methodOpen, onToggleMethod }: { plan: PlanView; methodOpen: boolean; onToggleMethod: () => void }) {
  const panelId = useId()
  const d = plan.dims
  const dims = [
    { label: '日期可行', a: d.dateFit, b: d.filled },
    { label: '预算符合', a: d.budgetFit, b: d.filled },
    { label: '首选目的地', a: d.topChoice, b: d.filled },
    { label: '住宿满足', a: d.stayFit, b: plan.participantCount },
  ]
  const parts = plan.myFit?.parts
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-bold text-ink-900">
          <BadgeCheck className="h-5 w-5 text-sky-500" />
          为什么推荐{plan.destination}
        </h3>
        <span className="rounded-md bg-cream-100 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-ink-500">可解释</span>
      </div>
      <p className="mt-3 rounded-2xl bg-cream-50 p-4 text-[14px] leading-7 text-ink-700 ring-1 ring-cream-200">{plan.explanation}</p>
      <ul className="mt-4 space-y-3">
        {dims.map((x) => {
          const pct = x.b ? (x.a / x.b) * 100 : 0
          return (
            <li key={x.label}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-600">{x.label}</span>
                <span className="num font-semibold text-ink-800">
                  {x.a}/{x.b} 人
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-cream-200">
                <div className={`h-full rounded-full ${pct >= 80 ? 'bg-sky-500' : pct >= 50 ? 'bg-sky-400' : 'bg-coral-400'}`} style={{ width: `${Math.max(pct, 3)}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-5 border-t border-dashed border-cream-300 pt-4">
        <button onClick={onToggleMethod} aria-expanded={methodOpen} aria-controls={panelId} className="flex w-full items-center justify-between py-1 text-left text-[13px] font-semibold text-sky-700 hover:text-sky-600">
          <span className="inline-flex items-center gap-1.5">
            <Calculator className="h-4 w-4" />
            匹配度如何计算？
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${methodOpen ? 'rotate-180' : ''}`} />
        </button>
        {methodOpen && (
          <div id={panelId} role="region" aria-label="匹配度计算依据" className="mt-3 animate-fade-in">
            <ul className="space-y-2.5">
              {MATCH_DIMENSIONS.map((m) => {
                const w = MATCH_WEIGHTS[m.key]
                const mine = parts?.[m.key]
                return (
                  <li key={m.key}>
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="font-semibold text-ink-700">{m.label}</span>
                      <span className="num shrink-0 text-ink-500">
                        {mine !== undefined && <span className="mr-2 text-sky-700">你 {mine}/{w}</span>}
                        权重 <span className="font-bold text-ink-800">{w}%</span>
                      </span>
                    </div>
                    <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-cream-200">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-coral-200" style={{ width: `${w}%` }} />
                      {mine !== undefined && <div className="absolute inset-y-0 left-0 rounded-full bg-coral-500" style={{ width: `${mine}%` }} />}
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-ink-400">{m.rule}</p>
                  </li>
                )
              })}
            </ul>
            <p className="num mt-3 flex items-center justify-between rounded-xl bg-cream-50 px-3 py-2 text-xs ring-1 ring-cream-200">
              <span className="text-ink-500">权重合计</span>
              <span className="font-bold text-ink-800">{WEIGHT_TOTAL}%</span>
            </p>
            <p className="mt-3 text-xs leading-5 text-ink-500">触发“绝对不能接受”的成员不计入可参加人数，且个人得分减半。团队匹配度为全部已填写成员得分的平均值。</p>
            <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-ink-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
              匹配度由确定性规则引擎在服务端计算，AI负责解释结果与生成行程建议。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------- 行程 ---------------- */

export function ItinerarySection(p: { plan: PlanView | null; isLocked: boolean; state: SharedState; meId: string; isOrganizer: boolean; readOnly: boolean; busyKey: string | null; onToggle: (key: string, done: boolean, label: string) => void }) {
  if (!p.plan) return null
  const plan = p.plan
  const keys = plan.itinerary.flatMap((d) => d.items.map((i) => i.key))
  const done = keys.filter((k) => p.state.tasks[k]).length
  return (
    <section id="itinerary" className="pt-12 sm:pt-16" aria-labelledby="itin-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="section-eyebrow">
            <Route className="h-3.5 w-3.5" />
            Itinerary
          </span>
          <h2 id="itin-title" className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-[28px]">
            {plan.destination} · {plan.days}天行程
          </h2>
          <p className="mt-2 text-sm text-ink-500">{p.isLocked ? '负责人完成后打勾，所有成员实时可见' : '预览：发起人锁定方案后，负责人才能认领并完成任务'}</p>
        </div>
        {p.isLocked && (
          <div className="w-full sm:w-64">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-ink-500">筹备进度</span>
              <span className="num font-bold text-ink-800">
                {done}/{keys.length}
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-ink-800/5">
              <div className="h-full rounded-full bg-sky-500 transition-all duration-500" style={{ width: `${keys.length ? (done / keys.length) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </div>
      <ol className="mt-6 grid gap-4 md:grid-cols-2">
        {plan.itinerary.map((day, di) => (
          <li key={day.date} className="card overflow-hidden">
            <div className="flex items-center gap-4 border-b border-dashed border-cream-300 px-5 py-4">
              <div className="flex h-14 w-14 shrink-0 -rotate-6 flex-col items-center justify-center rounded-2xl border-2 border-coral-500 text-coral-600">
                <span className="font-mono text-[9px] font-bold tracking-widest">DAY</span>
                <span className="num text-xl font-black leading-none">{di + 1}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="num text-xs font-medium text-ink-400">
                  {fmtMonthDay(day.date)} · {weekdayOf(day.date)}
                </p>
                <h3 className="mt-0.5 truncate text-base font-bold text-ink-900">{day.title}</h3>
              </div>
            </div>
            <ul className="px-5 py-3">
              {day.items.map((it) => {
                const isDone = !!p.state.tasks[it.key]
                const canEdit = p.isLocked && !p.readOnly && (it.ownerId === p.meId || p.isOrganizer)
                return (
                  <li key={it.key} className="flex gap-3 py-2.5">
                    <button
                      onClick={() => canEdit && p.onToggle(it.key, !isDone, it.activity)}
                      disabled={!canEdit || p.busyKey === it.key}
                      aria-pressed={isDone}
                      aria-label={`${isDone ? '标记为待办' : '标记为完成'}：${it.activity}`}
                      title={canEdit ? '' : p.isLocked ? '只有负责人或发起人可以更新' : '锁定方案后可更新'}
                      className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed"
                    >
                      {isDone ? <CheckCircle2 className="h-6 w-6 text-emerald-500" /> : <Circle className={`h-6 w-6 ${canEdit ? 'text-ink-300 hover:text-coral-500' : 'text-cream-300'}`} />}
                    </button>
                    <div className={`min-w-0 flex-1 ${isDone ? 'opacity-55' : ''}`}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="num inline-flex items-center gap-1 font-mono text-xs font-semibold text-coral-600">
                          <Clock className="h-3 w-3" />
                          {it.time}
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1 text-[13px] font-semibold text-ink-800">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                          <span className={isDone ? 'line-through' : ''}>{it.place}</span>
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] leading-6 text-ink-500">{it.activity}</p>
                      <p className="mt-1 text-xs text-ink-400">
                        负责人 <span className={it.ownerId === p.meId ? 'font-semibold text-coral-600' : 'text-ink-600'}>{it.ownerId === p.meId ? '我' : it.ownerName}</span>
                        <span className="num ml-3">{it.cost ? `人均 ${yuan(it.cost)}` : '费用已含在交通/住宿'}</span>
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ---------------- AA ---------------- */

export function SettleSection(p: { plan: PlanView | null; isLocked: boolean; state: SharedState; members: MemberSummary[]; meId: string; readOnly: boolean; busy: boolean; onTogglePaid: (paid: boolean) => void }) {
  if (!p.plan) return null
  const plan = p.plan
  const ids = plan.participants.map((x) => x.id)
  const paid = p.state.paidMembers.filter((id) => ids.includes(id))
  const total = plan.perPerson * plan.participantCount
  const meIn = ids.includes(p.meId)
  const mePaid = paid.includes(p.meId)
  const colorOf = (id: string) => p.members.find((m) => m.id === id)?.color ?? '#7A8094'
  return (
    <section id="settle" className="pt-12 sm:pt-16" aria-labelledby="settle-title">
      <span className="section-eyebrow">
        <Wallet className="h-3.5 w-3.5" />
        Budget estimate
      </span>
      <h2 id="settle-title" className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-[28px]">
        行程预算估算
      </h2>
      <p className="mt-2 text-sm text-ink-500">
        {plan.destination}方案 · 公共费用由 {plan.participantCount} 位参加成员均摊{plan.costEstimated ? ' · 费用为通用估算' : ''}
        {!p.isLocked && '（锁定方案后生效）'}。这是出发前的估算，真实花销请记在下方“实际费用台账”。
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[
          { label: '团队总预算', value: yuan(total), sub: `${plan.participantCount}人 × ${yuan(plan.perPerson)}` },
          { label: '人均预算', value: yuan(plan.perPerson), sub: `${plan.days}天${Math.max(plan.days - 1, 0)}晚` },
          { label: '已支付', value: yuan(paid.length * plan.perPerson), sub: `${paid.length}人已付` },
          { label: '待支付', value: yuan((plan.participantCount - paid.length) * plan.perPerson), sub: `${plan.participantCount - paid.length}人待付` },
        ].map((k) => (
          <div key={k.label} className="card p-4 sm:p-5">
            <p className="text-xs text-ink-500">{k.label}</p>
            <p className="num mt-2 text-[22px] font-black tracking-tight text-ink-900 sm:text-[26px]">{k.value}</p>
            <p className="mt-1 text-xs text-ink-400">{k.sub}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-5 sm:p-6">
          <h3 className="text-base font-bold text-ink-900">预算构成</h3>
          <ul className="mt-3 divide-y divide-dashed divide-cream-300">
            {plan.costs.map((c) => (
              <li key={c.key} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-800">
                    {c.label}
                    {c.shared && <span className="ml-1.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">均摊</span>}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-400">{c.note}</p>
                </div>
                <p className="num text-sm font-bold text-ink-800">{yuan(c.perPerson)}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-ink-900">成员AA明细</h3>
              <p className="mt-1 text-xs text-ink-400">每位成员只能标记自己的付款状态</p>
            </div>
            {p.isLocked && meIn && (
              <button onClick={() => p.onTogglePaid(!mePaid)} disabled={p.busy || p.readOnly} className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${mePaid ? 'bg-cream-100 text-ink-600 hover:bg-cream-200' : 'bg-ink-800 text-white hover:bg-ink-700'}`}>
                {mePaid ? '撤销我的付款' : '我已付款'}
              </button>
            )}
          </div>
          <ul className="mt-4 space-y-2">
            {plan.participants.map((m) => {
              const isPaid = paid.includes(m.id)
              return (
                <li key={m.id} className="flex items-center gap-3 rounded-2xl p-2">
                  <MemberDot name={m.displayName} color={colorOf(m.id)} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800">
                    {m.displayName}
                    {m.id === p.meId && <span className="ml-0.5 text-xs font-medium text-coral-600">（我）</span>}
                  </span>
                  <span className="num text-xs text-ink-500">{yuan(plan.perPerson)}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{isPaid ? '已付清' : '待支付'}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
