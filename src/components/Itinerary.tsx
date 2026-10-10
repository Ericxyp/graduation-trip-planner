import { CheckCircle2, Circle, Clock, Eye, MapPin, Route } from 'lucide-react'
import { memberById } from '../data'
import { addDays, fmtMD, weekday, yuan, type SchemeStats } from '../logic'
import type { Scheme } from '../types'
import Avatar from './Avatar'

interface Props {
  scheme: Scheme
  stats: SchemeStats
  isLocked: boolean
  tasks: Record<string, boolean>
  onToggle: (key: string, label: string) => void
  onGoConsensus: () => void
}

export default function Itinerary({ scheme, stats, isLocked, tasks, onToggle, onGoConsensus }: Props) {
  const keys = scheme.itinerary.flatMap((d, di) => d.items.map((_, ii) => `${scheme.id}-${di}-${ii}`))
  const done = keys.filter((k) => tasks[k]).length
  const pct = Math.round((done / keys.length) * 100)

  return (
    <section id="itinerary" className="pt-14 sm:pt-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="section-eyebrow">
            <Route className="h-3.5 w-3.5" />
            Itinerary
          </span>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-[28px]">
            {scheme.city} · {scheme.itinerary.length}天行程
          </h2>
          <p className="mt-2 text-sm text-ink-500">
            {fmtMD(scheme.start)}—{fmtMD(scheme.end)} · {stats.count}人同行 · 每项都有负责人，完成后打勾
          </p>
        </div>
        <div className="w-full sm:w-64">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-ink-500">筹备进度</span>
            <span className="num font-bold text-ink-800">
              {done}/{keys.length} · {pct}%
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-ink-800/5">
            <div className="h-full rounded-full bg-sky-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {!isLocked && (
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-dashed border-sky-300 bg-sky-50/70 p-4 sm:flex-row sm:items-center">
          <Eye className="hidden h-5 w-5 shrink-0 text-sky-600 sm:block" />
          <p className="flex-1 text-[13px] leading-6 text-sky-800">
            你正在预览「{scheme.label} · {scheme.city}」的行程。锁定方案后，行程会同步给全体成员，负责人将收到任务提醒。
          </p>
          <button onClick={onGoConsensus} className="shrink-0 self-start rounded-full bg-white px-4 py-2 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100 sm:self-auto">
            去锁定方案
          </button>
        </div>
      )}

      <ol className="mt-6 grid gap-4 md:grid-cols-2">
        {scheme.itinerary.map((day, di) => {
          const date = addDays(scheme.start, di)
          const dayCost = day.items.reduce((s, i) => s + i.cost, 0)
          const dayKeys = day.items.map((_, ii) => `${scheme.id}-${di}-${ii}`)
          const dayDone = dayKeys.filter((k) => tasks[k]).length
          return (
            <li key={di} className="card overflow-hidden">
              <div className="flex items-center gap-4 border-b border-dashed border-cream-300 px-5 py-4">
                <div className="flex h-14 w-14 shrink-0 -rotate-6 flex-col items-center justify-center rounded-2xl border-2 border-coral-500 text-coral-600">
                  <span className="font-mono text-[9px] font-bold tracking-widest">DAY</span>
                  <span className="num text-xl font-black leading-none">{di + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="num text-xs font-medium text-ink-400">
                    {fmtMD(date)} · {weekday(date)}
                  </p>
                  <h3 className="mt-0.5 truncate text-base font-bold text-ink-900">{day.title}</h3>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-ink-400">当日人均</p>
                  <p className="num text-sm font-bold text-ink-800">{dayCost ? yuan(dayCost) : '—'}</p>
                </div>
              </div>

              <ul className="relative px-5 py-4">
                <span aria-hidden className="absolute bottom-8 left-[37px] top-8 w-0 border-l-2 border-dashed border-cream-300" />
                {day.items.map((it, ii) => {
                  const key = `${scheme.id}-${di}-${ii}`
                  const isDone = !!tasks[key]
                  const owner = memberById(it.owner)
                  return (
                    <li key={key} className="relative flex gap-3 py-2.5">
                      <button
                        onClick={() => onToggle(key, `${it.place} · ${it.activity}`)}
                        aria-pressed={isDone}
                        aria-label={`${isDone ? '标记为待办' : '标记为完成'}：${it.activity}`}
                        className="relative z-10 -m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white p-1"
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-6 w-6 text-emerald-500" strokeWidth={2.2} />
                        ) : (
                          <Circle className="h-6 w-6 text-ink-300 transition hover:text-coral-500" strokeWidth={2} />
                        )}
                      </button>
                      <div className={`min-w-0 flex-1 transition ${isDone ? 'opacity-55' : ''}`}>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="num inline-flex items-center gap-1 font-mono text-xs font-semibold text-coral-600">
                            <Clock className="h-3 w-3" />
                            {it.time}
                          </span>
                          <span className="inline-flex min-w-0 items-center gap-1 text-[13px] font-semibold text-ink-800">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                            <span className={isDone ? 'line-through decoration-ink-300' : ''}>{it.place}</span>
                          </span>
                        </div>
                        <p className="mt-1 text-[13px] leading-6 text-ink-500">{it.activity}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                          <span className="inline-flex items-center gap-1.5 text-ink-500">
                            <Avatar id={it.owner} size="xs" ring={false} />
                            负责人 {owner.name}
                          </span>
                          <span className="num text-ink-400">{it.cost ? `人均 ${yuan(it.cost)}` : '费用已含在交通/住宿'}</span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="flex items-center justify-between bg-cream-50 px-5 py-2.5 text-xs text-ink-500">
                <span>
                  已完成 <span className="num font-semibold text-ink-700">{dayDone}</span>/{day.items.length}
                </span>
                {dayDone === day.items.length && <span className="font-semibold text-emerald-600">当日准备就绪</span>}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
