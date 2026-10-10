import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Check, Plus, ShieldCheck, X } from 'lucide-react'
import { BUDGET_OPTIONS, DATE_OPTIONS, DEST_OPTIONS, MUST_OPTIONS, NO_OPTIONS, PACE_OPTIONS, STAY_OPTIONS } from '../data'
import { parseDate, weekday } from '../logic'
import type { DestId, MyPrefs, Pace, StayPref } from '../types'

interface Props {
  open: boolean
  initial: MyPrefs | null
  onClose: () => void
  onSubmit: (p: MyPrefs) => void
}

interface Draft {
  dates: string[]
  budget: string
  destinations: DestId[]
  pace: Pace
  stay: StayPref
  musts: string[]
  nos: string[]
}

const empty = (): Draft => ({ dates: [], budget: '', destinations: [], pace: 'balanced', stay: 'any', musts: [], nos: [] })

export default function PreferenceSheet({ open, initial, onClose, onSubmit }: Props) {
  const [d, setD] = useState<Draft>(empty)
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    setD(initial ? { ...initial } : empty())
    setTouched(false)
    setSubmitting(false)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, initial])

  if (!open) return null

  const errors = {
    dates: d.dates.length < 2 ? '请至少选择2个可出发的日期' : '',
    budget: !d.budget ? '请选择你的总预算区间' : '',
    destinations: d.destinations.length === 0 ? '请至少选择1个想去的城市' : '',
  }
  const hasError = Object.values(errors).some(Boolean)
  const missing = Object.values(errors).filter(Boolean).length

  const toggle = <K extends 'dates' | 'musts' | 'nos'>(key: K, v: string) =>
    setD((s) => ({ ...s, [key]: s[key].includes(v) ? s[key].filter((x) => x !== v) : [...s[key], v].sort() }))

  const toggleDest = (id: DestId) =>
    setD((s) => ({ ...s, destinations: s.destinations.includes(id) ? s.destinations.filter((x) => x !== id) : [...s.destinations, id] }))

  const move = (i: number, dir: -1 | 1) =>
    setD((s) => {
      const arr = [...s.destinations]
      const j = i + dir
      if (j < 0 || j >= arr.length) return s
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return { ...s, destinations: arr }
    })

  const submit = () => {
    setTouched(true)
    if (hasError) {
      document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true)
    window.setTimeout(() => {
      onSubmit({ ...d, dates: [...d.dates].sort(), submittedAt: new Date().toISOString() })
    }, 650)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end" role="dialog" aria-modal="true" aria-labelledby="pref-title">
      <div className="absolute inset-0 animate-fade-in bg-ink-900/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full animate-sheet-in flex-col overflow-hidden rounded-t-[28px] bg-cream-50 shadow-lift sm:max-h-none sm:max-w-[520px] sm:animate-panel-in sm:rounded-none sm:rounded-l-[28px]">
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-ink-800/15 sm:hidden" />
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4 sm:px-7 sm:pt-6">
          <div>
            <h2 id="pref-title" className="text-xl font-extrabold text-ink-900">
              {initial ? '修改我的偏好' : '填写我的偏好'}
            </h2>
            <p className="mt-1 text-[13px] text-ink-500">大约需要 1 分钟，说真话才能找到真共识</p>
          </div>
          <button onClick={onClose} aria-label="关闭" className="-mr-2 rounded-full p-2 text-ink-400 hover:bg-cream-200 hover:text-ink-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-5 flex items-start gap-2.5 rounded-2xl bg-sky-50 px-4 py-3 ring-1 ring-sky-100 sm:mx-7">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <p className="text-[13px] leading-5 text-sky-800">预算和敏感条件仅用于系统匹配，默认不向其他成员公开。</p>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 pb-6 pt-5 sm:px-7">
          <Field title="可出发日期" hint="多选，选得越多越容易凑齐" error={touched ? errors.dates : ''}>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {DATE_OPTIONS.map((ds) => {
                const on = d.dates.includes(ds)
                const dt = parseDate(ds)
                return (
                  <button
                    key={ds}
                    type="button"
                    onClick={() => toggle('dates', ds)}
                    aria-pressed={on}
                    className={`relative flex flex-col items-center rounded-xl py-2.5 transition ${
                      on ? 'bg-coral-500 text-white shadow-[0_6px_14px_-8px_rgba(232,80,47,0.9)]' : 'bg-white text-ink-700 ring-1 ring-ink-800/10 hover:ring-coral-300'
                    }`}
                  >
                    <span className={`text-[10px] ${on ? 'text-white/80' : 'text-ink-400'}`}>{weekday(ds)}</span>
                    <span className="num text-base font-black leading-6">{dt.getDate()}</span>
                    <span className={`text-[10px] ${on ? 'text-white/80' : 'text-ink-400'}`}>6月</span>
                  </button>
                )
              })}
            </div>
          </Field>

          <Field title="总预算区间" hint="含往返交通、住宿、吃喝玩，单人总额" error={touched ? errors.budget : ''} privacy>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BUDGET_OPTIONS.map((b) => (
                <Choice key={b.id} on={d.budget === b.id} onClick={() => setD((s) => ({ ...s, budget: b.id }))}>
                  <span className="num">¥{b.label}</span>
                </Choice>
              ))}
            </div>
          </Field>

          <Field title="目的地偏好" hint="可多选，用箭头调整先后顺序" error={touched ? errors.destinations : ''}>
            {d.destinations.length > 0 && (
              <ol className="mb-2 space-y-2">
                {d.destinations.map((id, i) => {
                  const o = DEST_OPTIONS.find((x) => x.id === id)!
                  return (
                    <li key={id} className="flex items-center gap-3 rounded-xl bg-white p-2.5 pl-3 ring-1 ring-coral-300">
                      <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-coral-500 text-sm font-black text-white">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-ink-800">{o.name}</p>
                        <p className="text-xs text-ink-400">{o.desc}</p>
                      </div>
                      <button type="button" aria-label={`${o.name} 上移`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg p-2 text-ink-500 hover:bg-cream-100 disabled:opacity-25">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`${o.name} 下移`}
                        disabled={i === d.destinations.length - 1}
                        onClick={() => move(i, 1)}
                        className="rounded-lg p-2 text-ink-500 hover:bg-cream-100 disabled:opacity-25"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button type="button" aria-label={`移除${o.name}`} onClick={() => toggleDest(id)} className="rounded-lg p-2 text-ink-400 hover:bg-cream-100 hover:text-coral-600">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
            <div className="flex flex-wrap gap-2">
              {DEST_OPTIONS.filter((o) => !d.destinations.includes(o.id)).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleDest(o.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-ink-800/20 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink-700 hover:border-coral-400 hover:text-coral-700"
                >
                  <Plus className="h-4 w-4" />
                  {o.name}
                </button>
              ))}
            </div>
          </Field>

          <Field title="旅行节奏">
            <div className="grid grid-cols-3 gap-2">
              {PACE_OPTIONS.map((p) => (
                <Choice key={p.id} on={d.pace === p.id} onClick={() => setD((s) => ({ ...s, pace: p.id }))}>
                  <span className="block text-sm font-bold">{p.label}</span>
                  <span className={`mt-0.5 block text-[11px] font-normal leading-4 ${d.pace === p.id ? 'text-white/80' : 'text-ink-400'}`}>{p.desc}</span>
                </Choice>
              ))}
            </div>
          </Field>

          <Field title="住宿要求">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {STAY_OPTIONS.map((o) => (
                <Choice key={o.id} on={d.stay === o.id} onClick={() => setD((s) => ({ ...s, stay: o.id }))} align="left">
                  {o.label}
                </Choice>
              ))}
            </div>
          </Field>

          <Field title="必须满足的条件" hint="可多选" privacy>
            <div className="flex flex-wrap gap-2">
              {MUST_OPTIONS.map((o) => (
                <Toggle key={o} on={d.musts.includes(o)} onClick={() => toggle('musts', o)} tone="sky">
                  {o}
                </Toggle>
              ))}
            </div>
          </Field>

          <Field title="绝对不能接受的条件" hint="可多选，会作为一票否决项" privacy>
            <div className="flex flex-wrap gap-2">
              {NO_OPTIONS.map((o) => (
                <Toggle key={o} on={d.nos.includes(o)} onClick={() => toggle('nos', o)} tone="ink">
                  {o}
                </Toggle>
              ))}
            </div>
          </Field>
        </div>

        <div className="border-t border-ink-800/5 bg-white px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 sm:px-7 sm:pb-5">
          {touched && hasError && <p className="mb-2 text-center text-xs font-medium text-coral-600">还有 {missing} 项必填内容未完成</p>}
          <button onClick={submit} disabled={submitting} className="btn-primary w-full py-3.5 text-[15px]">
            {submitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                正在重新计算共识…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {initial ? '保存修改' : '提交偏好'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ title, hint, error, privacy, children }: { title: string; hint?: string; error?: string; privacy?: boolean; children: ReactNode }) {
  return (
    <fieldset data-error={error ? 'true' : undefined}>
      <legend className="mb-3 flex w-full flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[15px] font-bold text-ink-900">{title}</span>
        {privacy && (
          <span className="inline-flex items-center gap-0.5 rounded bg-cream-200 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">
            <ShieldCheck className="h-3 w-3" />
            仅系统可见
          </span>
        )}
        {hint && <span className="text-xs text-ink-400">{hint}</span>}
      </legend>
      {children}
      {error && <p className="mt-2 text-xs font-medium text-coral-600">{error}</p>}
    </fieldset>
  )
}

function Choice({ on, onClick, children, align = 'center' }: { on: boolean; onClick: () => void; children: ReactNode; align?: 'center' | 'left' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${align === 'left' ? 'text-left' : 'text-center'} ${
        on ? 'bg-ink-800 text-white' : 'bg-white text-ink-700 ring-1 ring-ink-800/10 hover:ring-ink-800/25'
      }`}
    >
      {children}
    </button>
  )
}

function Toggle({ on, onClick, children, tone }: { on: boolean; onClick: () => void; children: ReactNode; tone: 'sky' | 'ink' }) {
  const onCls = tone === 'sky' ? 'bg-sky-500 text-white ring-sky-500' : 'bg-ink-800 text-white ring-ink-800'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[13px] font-medium ring-1 transition ${on ? onCls : 'bg-white text-ink-600 ring-ink-800/10 hover:ring-ink-800/25'}`}
    >
      {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      {children}
    </button>
  )
}
