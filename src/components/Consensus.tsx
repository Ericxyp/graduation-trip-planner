import {
  AlertTriangle,
  Calculator,
  ChevronDown,
  Info,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  Lightbulb,
  Lock,
  PenLine,
  Sparkles,
  ThumbsUp,
  Unlock,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { MEMBERS, PACE_LABEL, SCHEMES, schemeById } from '../data'
import { useId, useState } from 'react'
import { MATCH_DIMENSIONS, MATCH_WEIGHTS, fmtMD, pickBest, rangeDays, weekday, yuan, type SchemeStats } from '../logic'
import type { MemberId, Scheme, SchemeId } from '../types'
import Avatar from './Avatar'

interface Props {
  stats: Record<SchemeId, SchemeStats>
  selected: SchemeId
  locked: SchemeId | null
  hasMine: boolean
  onSelect: (id: SchemeId) => void
  onLock: (id: SchemeId) => void
  onUnlock: () => void
  onFill: () => void
}

const EXCLUDE_REASON: Record<SchemeId, Partial<Record<MemberId, string>>> = {
  consensus: {},
  budget: { tang: '6月24日入职报到' },
  memorable: { zhe: '6月19日回校办离校', k: '6月19日回校办离校' },
}

export default function Consensus({ stats, selected, locked, hasMine, onSelect, onLock, onUnlock, onFill }: Props) {
  const scheme = schemeById(selected)
  const st = stats[selected]
  const bestId = hasMine ? pickBest(stats) : null
  const [methodOpen, setMethodOpen] = useState(false)

  return (
    <section id="consensus" className="pt-14 sm:pt-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="section-eyebrow">
            <Sparkles className="h-3.5 w-3.5" />
            AI共识分析
          </span>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-[28px]">三套方案，每个取舍都说得清</h2>
          <p className="mt-2 text-sm text-ink-500">
            基于 <span className="num font-semibold text-ink-700">{st.filledCount}</span> 位成员的私密偏好生成，按日期、预算、目的地、节奏与住宿五个维度综合打分
          </p>
        </div>
        {!hasMine && (
          <button onClick={onFill} className="inline-flex items-center gap-1.5 rounded-full bg-coral-50 px-4 py-2 text-sm font-semibold text-coral-700 ring-1 ring-coral-200 transition hover:bg-coral-100">
            <PenLine className="h-4 w-4" />
            补充你的偏好，让结果把你算进去
          </button>
        )}
      </div>

      {/* 方案切换 */}
      <div role="tablist" aria-label="推荐方案" className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
        {SCHEMES.map((s, i) => {
          const active = s.id === selected
          const sst = stats[s.id]
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(s.id)}
              className={`relative overflow-hidden rounded-2xl p-3 text-left transition sm:rounded-3xl sm:p-5 ${
                active ? 'bg-ink-800 text-white shadow-lift' : 'bg-white text-ink-800 shadow-card ring-1 ring-ink-800/5 hover:ring-ink-800/15'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={`font-mono text-[10px] font-semibold tracking-widest ${active ? 'text-white/50' : 'text-ink-400'}`}>
                  PLAN {String.fromCharCode(65 + i)}
                </span>
                {locked === s.id && (
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-coral-500 text-white' : 'bg-coral-50 text-coral-700'}`}>
                    <Lock className="h-2.5 w-2.5" />
                    <span className="hidden sm:inline">已锁定</span>
                  </span>
                )}
                {bestId === s.id && locked !== s.id && (
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-sky-500 text-white' : 'bg-sky-50 text-sky-700'}`}>
                    <Sparkles className="h-2.5 w-2.5" />
                    <span className="hidden sm:inline">你的最佳</span>
                  </span>
                )}
              </div>
              <p className={`mt-1.5 text-[15px] font-extrabold sm:text-lg ${active ? 'text-white' : 'text-ink-900'}`}>{s.label}</p>
              <p className={`mt-0.5 text-xs sm:text-sm ${active ? 'text-white/70' : 'text-ink-500'}`}>
                {s.city}
                <span className="hidden sm:inline"> · {s.slogan}</span>
              </p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className={`num text-xl font-black sm:text-2xl ${active ? 'text-coral-300' : 'text-coral-600'}`}>{sst.match}</span>
                <span className={`text-[11px] ${active ? 'text-white/60' : 'text-ink-400'}`}>% 匹配</span>
              </div>
              {active && <span className="absolute inset-x-0 bottom-0 h-1 bg-coral-500" />}
            </button>
          )
        })}
      </div>

      <div key={selected} className="mt-4 grid animate-slide-up gap-4 lg:grid-cols-[1.35fr_1fr]">
        <SchemeDetail scheme={scheme} st={st} />
        <div className="flex flex-col gap-4">
          <ExplainCard scheme={scheme} st={st} methodOpen={methodOpen} onToggleMethod={() => setMethodOpen((v) => !v)} />
          <AiTipCard scheme={scheme} />
          <LockPanel scheme={scheme} locked={locked} onLock={onLock} onUnlock={onUnlock} />
        </div>
      </div>
    </section>
  )
}

function SchemeDetail({ scheme, st }: { scheme: Scheme; st: SchemeStats }) {
  const days = rangeDays(scheme.start, scheme.end)
  const out = MEMBERS.filter((m) => !st.participants.includes(m.id))
  const reasonOf = (id: MemberId) => {
    if (id === 'me') return st.myFit ? '可出发日期未覆盖' : '尚未填写偏好'
    return EXCLUDE_REASON[scheme.id][id] ?? '日期冲突'
  }

  return (
    <article className="card overflow-hidden">
      {/* 票根头 */}
      <div className="relative bg-coral-500 px-5 pb-6 pt-5 text-white sm:px-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-semibold tracking-[0.2em] text-white/70">SHA → {scheme.cityCode}</p>
            <h3 className="mt-1 text-[34px] font-black leading-none tracking-tight sm:text-[40px]">{scheme.city}</h3>
            <p className="mt-2 text-sm text-white/85">
              {scheme.label} · {scheme.slogan}
            </p>
          </div>
          <MatchRing value={st.match} />
        </div>
        <div className="mt-5 flex items-center gap-2 text-sm">
          <CalendarDays className="h-4 w-4 text-white/80" />
          <span className="num font-semibold">
            {fmtMD(scheme.start)}—{fmtMD(scheme.end)}
          </span>
          <span className="text-white/70">
            {weekday(scheme.start)}出发 · {days.length}天{days.length - 1}晚
          </span>
        </div>
      </div>
      <div className="relative">
        <span aria-hidden className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-cream-100" />
        <span aria-hidden className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-cream-100" />
      </div>

      <div className="px-5 pb-6 pt-5 sm:px-7">
        <dl className="grid grid-cols-3 divide-x divide-dashed divide-cream-300 rounded-2xl bg-cream-50 py-4 ring-1 ring-cream-200">
          <Stat icon={Users} label="可参加" value={`${st.count}/8`} unit="人" />
          <Stat icon={Wallet} label="人均预算" value={yuan(st.perPerson)} />
          <Stat icon={CalendarDays} label="日期交集" value={`${st.overlapDays}`} unit="天" />
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {scheme.tags.map((t) => (
            <span key={t} className="rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
              {t}
            </span>
          ))}
          <span className="rounded-lg bg-cream-100 px-2.5 py-1 text-xs font-medium text-ink-600">节奏：{PACE_LABEL[scheme.pace]}</span>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-bold text-ink-800">
              <ThumbsUp className="h-4 w-4 text-emerald-600" />
              推荐理由
            </h4>
            <ul className="mt-3 space-y-2.5">
              {scheme.reasons.map((r) => (
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
            <ul className="mt-3 space-y-2.5">
              {scheme.conflicts.map((c) => (
                <li key={c.title} className="rounded-xl bg-cream-50 p-3 ring-1 ring-cream-200">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-800">
                    <span className={`h-1.5 w-1.5 rounded-full ${c.level === 'high' ? 'bg-coral-500' : c.level === 'mid' ? 'bg-amber-400' : 'bg-sky-400'}`} />
                    {c.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-500">{c.detail}</p>
                </li>
              ))}
              {st.myFit && !st.myFit.dates && (
                <li className="rounded-xl bg-coral-50 p-3 ring-1 ring-coral-100">
                  <p className="text-[13px] font-semibold text-coral-700">与你的日期冲突</p>
                  <p className="mt-1 text-xs leading-5 text-ink-600">你填写的可出发日期没有完整覆盖 {fmtMD(scheme.start)}—{fmtMD(scheme.end)}</p>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-6 border-t border-dashed border-cream-300 pt-5">
          <h4 className="text-sm font-bold text-ink-800">参加成员</h4>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex -space-x-2">
              {st.participants.map((id) => (
                <Avatar key={id} id={id} size="sm" />
              ))}
            </div>
            {out.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {out.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 py-1 pl-1 pr-2.5 text-xs text-ink-500">
                    <Avatar id={m.id} size="xs" dim ring={false} />
                    {m.name}：{reasonOf(m.id)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {st.myFit && <MyFitRow st={st} scheme={scheme} />}
      </div>
    </article>
  )
}

function MyFitRow({ st, scheme }: { st: SchemeStats; scheme: Scheme }) {
  const f = st.myFit!
  const items = [
    { ok: f.dates, label: '日期' },
    { ok: f.budget, label: '预算' },
    { ok: f.destRank === 1, label: f.destRank ? `目的地第${f.destRank}志愿` : '目的地未选' },
    { ok: f.pace, label: `节奏${PACE_LABEL[scheme.pace]}` },
    { ok: f.stay, label: '住宿' },
  ]
  return (
    <div className="mt-5 rounded-2xl bg-sky-50 p-4">
      <p className="text-[13px] font-bold text-sky-700">与你的偏好对比 · 你的个人匹配 {f.score} 分</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {items.map((i) => (
          <span key={i.label} className={`inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-medium ${i.ok ? 'text-ink-700' : 'text-ink-400'}`}>
            {i.ok ? <Check className="h-3 w-3 text-emerald-600" strokeWidth={3} /> : <X className="h-3 w-3 text-coral-500" strokeWidth={3} />}
            {i.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, unit }: { icon: typeof Users; label: string; value: string; unit?: string }) {
  return (
    <div className="px-3 text-center sm:px-4">
      <dt className="flex items-center justify-center gap-1 text-[11px] text-ink-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="mt-1">
        <span className="num text-lg font-black text-ink-900 sm:text-2xl">{value}</span>
        {unit && <span className="ml-0.5 text-[11px] text-ink-400">{unit}</span>}
      </dd>
    </div>
  )
}

function MatchRing({ value }: { value: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-[76px] w-[76px] shrink-0" aria-label={`匹配度 ${value}%`}>
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="7" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-xl font-black leading-none">{value}%</span>
        <span className="mt-0.5 text-[10px] text-white/80">匹配度</span>
      </div>
    </div>
  )
}

function ExplainCard({ scheme, st, methodOpen, onToggleMethod }: { scheme: Scheme; st: SchemeStats; methodOpen: boolean; onToggleMethod: () => void }) {
  const dims = [
    { label: '日期可行', a: st.dateFitCount, b: st.filledCount, unit: '人' },
    { label: '预算符合', a: st.budgetFitCount, b: st.filledCount, unit: '人' },
    { label: '首选目的地', a: st.topChoiceCount, b: st.filledCount, unit: '人' },
    { label: '住宿满足', a: st.count - st.stayMissCount, b: st.count, unit: '人' },
  ]
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-bold text-ink-900">
          <BadgeCheck className="h-5 w-5 text-sky-500" />
          为什么推荐{scheme.city}
        </h3>
        <span className="rounded-md bg-cream-100 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-ink-500">可解释</span>
      </div>
      <p className="mt-3 rounded-2xl bg-cream-50 p-4 text-[14px] leading-7 text-ink-700 ring-1 ring-cream-200">{st.explanation}</p>
      <ul className="mt-4 space-y-3">
        {dims.map((d) => {
          const pct = d.b ? (d.a / d.b) * 100 : 0
          return (
            <li key={d.label}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-600">{d.label}</span>
                <span className="num font-semibold text-ink-800">
                  {d.a}/{d.b} {d.unit}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-cream-200">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${pct >= 80 ? 'bg-sky-500' : pct >= 50 ? 'bg-sky-400' : 'bg-coral-400'}`}
                  style={{ width: `${Math.max(pct, 3)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      <MatchMethod open={methodOpen} onToggle={onToggleMethod} st={st} />
    </div>
  )
}

function MatchMethod({ open, onToggle, st }: { open: boolean; onToggle: () => void; st: SchemeStats }) {
  const panelId = useId()
  const total = Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0)
  const parts = st.myFit?.parts
  return (
    <div className="mt-5 border-t border-dashed border-cream-300 pt-4">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between rounded-xl py-1 text-left text-[13px] font-semibold text-sky-700 hover:text-sky-600"
      >
        <span className="inline-flex items-center gap-1.5">
          <Calculator className="h-4 w-4" />
          匹配度如何计算？
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={panelId} role="region" aria-label="匹配度计算依据" className="mt-3 animate-fade-in">
          <p className="text-xs leading-5 text-ink-500">
            每位成员按五个维度得到 0–100 分，团队匹配度为全部已填写成员得分的平均值。
          </p>
          <ul className="mt-3 space-y-2.5">
            {MATCH_DIMENSIONS.map((d) => {
              const w = MATCH_WEIGHTS[d.key]
              const mine = parts?.[d.key]
              return (
                <li key={d.key}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="font-semibold text-ink-700">{d.label}</span>
                    <span className="num shrink-0 text-ink-500">
                      {mine !== undefined && <span className="mr-2 text-sky-700">你 {mine}/{w}</span>}
                      权重 <span className="font-bold text-ink-800">{w}%</span>
                    </span>
                  </div>
                  <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-cream-200">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-coral-200" style={{ width: `${w}%` }} />
                    {mine !== undefined && <div className="absolute inset-y-0 left-0 rounded-full bg-coral-500" style={{ width: `${mine}%` }} />}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-ink-400">{d.rule}</p>
                </li>
              )
            })}
          </ul>
          <p className="num mt-3 flex items-center justify-between rounded-xl bg-cream-50 px-3 py-2 text-xs ring-1 ring-cream-200">
            <span className="text-ink-500">权重合计</span>
            <span className="font-bold text-ink-800">{total}%</span>
          </p>
          {parts && (
            <p className="num mt-2 text-xs text-sky-700">
              你在该方案的个人得分：{st.myFit!.score} 分（深色为你的得分，浅色为满分）
            </p>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-ink-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
            匹配度由确定性规则引擎计算，AI负责解释结果与生成行程建议。
          </p>
        </div>
      )}
    </div>
  )
}

function AiTipCard({ scheme }: { scheme: Scheme }) {
  const applied = scheme.id === 'consensus'
  return (
    <div className="relative overflow-hidden rounded-3xl bg-ink-800 p-5 text-white shadow-lift sm:p-6">
      <span aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full border-[14px] border-coral-500/25" />
      <div className="relative">
        <p className="flex items-center gap-2 text-xs font-semibold text-coral-300">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-coral-500 text-white">
            <Lightbulb className="h-3.5 w-3.5" />
          </span>
          AI建议 · 调整一个条件，结果会更好
        </p>
        <p className="mt-3 text-[16px] font-bold leading-7">{scheme.aiTip.headline}</p>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
          <span className="rounded-xl bg-white/10 px-3 py-2 leading-5 text-white/70 line-through decoration-white/40">{scheme.aiTip.before}</span>
          <ArrowRight className="h-4 w-4 text-coral-300" />
          <span className="rounded-xl bg-coral-500/20 px-3 py-2 font-semibold leading-5 text-white ring-1 ring-coral-400/50">{scheme.aiTip.after}</span>
        </div>
        <p className={`mt-3 inline-flex items-center gap-1.5 text-xs ${applied ? 'text-emerald-300' : 'text-white/60'}`}>
          {applied ? <BadgeCheck className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          {scheme.aiTip.status}
        </p>
      </div>
    </div>
  )
}

function LockPanel({ scheme, locked, onLock, onUnlock }: { scheme: Scheme; locked: SchemeId | null; onLock: (id: SchemeId) => void; onUnlock: () => void }) {
  if (locked === scheme.id) {
    return (
      <div className="flex items-center gap-3 rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Lock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-emerald-800">已锁定{scheme.city}方案</p>
          <p className="text-xs text-emerald-700/80">行程与AA账单已按此方案生成</p>
        </div>
        <button onClick={onUnlock} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
          <Unlock className="h-3.5 w-3.5" />
          取消锁定
        </button>
      </div>
    )
  }
  return (
    <button onClick={() => onLock(scheme.id)} className="btn-primary w-full py-4 text-[15px]">
      <Lock className="h-4 w-4" />
      {locked ? `改为锁定${scheme.city}方案` : `锁定${scheme.city}方案并生成行程`}
    </button>
  )
}
