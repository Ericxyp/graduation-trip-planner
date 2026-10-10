import { ArrowDown, ArrowRight, ArrowUp, Lock, Minus, Sparkles, X } from 'lucide-react'
import { schemeById } from '../data'
import { yuan, type RecommendationDelta } from '../logic'
import Modal from './Modal'

interface Props {
  delta: RecommendationDelta | null
  onClose: () => void
  onViewBasis: () => void
}

type Trend = 'up' | 'down' | 'same'
const trendOf = (a: number, b: number): Trend => (b > a ? 'up' : b < a ? 'down' : 'same')

/** good: 该指标上升是否为好事（人均预算下降才是好事） */
function DeltaRow({ label, before, after, fmt, good }: { label: string; before: number; after: number; fmt: (n: number) => string; good: 'up' | 'down' }) {
  const t = trendOf(before, after)
  const positive = t !== 'same' && t === good
  const tone = t === 'same' ? 'text-ink-400 bg-cream-100' : positive ? 'text-emerald-700 bg-emerald-50' : 'text-coral-700 bg-coral-50'
  const Icon = t === 'up' ? ArrowUp : t === 'down' ? ArrowDown : Minus
  const diff = after - before
  return (
    <li className="flex items-center gap-2 py-3 min-[360px]:gap-3">
      <span className="w-14 shrink-0 text-[13px] text-ink-500 min-[360px]:w-[72px]">{label}</span>
      <span className="num min-w-0 flex-1 whitespace-nowrap text-sm font-semibold text-ink-800 min-[360px]:text-[15px]">
        <span className="text-ink-400">{fmt(before)}</span>
        <ArrowRight className="mx-1 inline h-3.5 w-3.5 -translate-y-px text-ink-300 min-[360px]:mx-1.5" />
        <span className="font-black">{fmt(after)}</span>
      </span>
      <span className={`num inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>
        <Icon className="h-3 w-3" strokeWidth={2.5} />
        {t === 'same' ? '不变' : `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}`}
      </span>
    </li>
  )
}

export default function ChangeFeedback({ delta, onClose, onViewBasis }: Props) {
  if (!delta) return null
  const afterS = schemeById(delta.afterSchemeId)
  const beforeS = schemeById(delta.beforeSchemeId)
  const changed = delta.beforeSchemeId !== delta.afterSchemeId
  const locked = delta.lockedSchemeId ? schemeById(delta.lockedSchemeId) : null

  return (
    <Modal open onClose={onClose} labelledBy="delta-title">
      <div className="overflow-hidden rounded-t-[28px] bg-white shadow-lift sm:rounded-[28px]">
        <div className="relative bg-ink-800 px-6 pb-6 pt-5 text-white">
          <button onClick={onClose} aria-label="关闭" className="absolute right-3 top-3 rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-coral-300">
            <Sparkles className="h-3.5 w-3.5" />
            {delta.isUpdate ? '偏好已更新 · 规则引擎已重新计算' : '偏好已提交 · 规则引擎已重新计算'}
          </p>
          <h2 id="delta-title" className="mt-2 text-xl font-extrabold">
            {delta.isUpdate ? '你的修改改变了结果' : '你的加入改变了结果'}
          </h2>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] text-white/50">SHA → {afterS.cityCode}</p>
              <p className="mt-0.5 text-[34px] font-black leading-none">{afterS.city}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${changed ? 'bg-coral-500 text-white' : 'bg-white/10 text-white'}`}>
              {changed ? `最佳方案由${beforeS.city}变为${afterS.city}` : `最佳方案仍为${afterS.city}`}
            </span>
          </div>
        </div>

        <div className="px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-2">
          <ul className="divide-y divide-dashed divide-cream-300">
            <DeltaRow label="匹配度" before={delta.beforeMatch} after={delta.afterMatch} fmt={(n) => `${n}%`} good="up" />
            <DeltaRow label="参与人数" before={delta.beforeCount} after={delta.afterCount} fmt={(n) => `${n}人`} good="up" />
            <DeltaRow label="人均预算" before={delta.beforePerPerson} after={delta.afterPerPerson} fmt={yuan} good="down" />
          </ul>

          <p className="mt-2 rounded-2xl bg-cream-50 p-4 text-[13px] leading-6 text-ink-700 ring-1 ring-cream-200">{delta.summary}</p>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-400">
            <span>三套方案匹配度：</span>
            {delta.rows.map((r) => (
              <span key={r.id} className="num">
                {schemeById(r.id).city} {r.before}%→<span className={r.after > r.before ? 'font-semibold text-emerald-700' : r.after < r.before ? 'font-semibold text-coral-700' : 'text-ink-500'}>{r.after}%</span>
              </span>
            ))}
          </div>

          {locked && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-sky-50 p-3 text-[13px] leading-5 text-sky-800 ring-1 ring-sky-100">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              个人推荐已更新，团队当前仍锁定{locked.city}方案
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button onClick={onViewBasis} className="btn-ghost py-3 text-sm">
              查看推荐依据
            </button>
            <button data-autofocus onClick={onClose} className="btn-primary py-3 text-sm">
              继续规划
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
