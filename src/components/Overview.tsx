import { ArrowRight, Check, PlayCircle, ClipboardList, Crown, Lock, MapPin, PenLine, Plane, Route, Sparkles, UserPlus, Wallet } from 'lucide-react'
import { MEMBERS, TRIP } from '../data'
import type { Scheme } from '../types'
import Avatar from './Avatar'

interface Props {
  filledCount: number
  hasMine: boolean
  locked: Scheme | null
  selectedCity: string
  tasksDone: number
  tasksTotal: number
  paidCount: number
  settleCount: number
  onFill: () => void
  onInvite: () => void
  onDemo: () => void
  onJump: (id: string) => void
}

type StepState = 'done' | 'current' | 'todo'

export default function Overview(p: Props) {
  const steps = [
    {
      key: 'collect',
      title: '收集偏好',
      icon: ClipboardList,
      done: p.filledCount >= TRIP.total,
      detail: `${p.filledCount}/${TRIP.total} 已填写`,
      target: 'members',
    },
    {
      key: 'consensus',
      title: '形成共识',
      icon: Sparkles,
      done: !!p.locked,
      detail: p.locked ? `已选定${p.locked.city}` : `正在比较 3 个方案`,
      target: 'consensus',
    },
    {
      key: 'itinerary',
      title: '锁定行程',
      icon: Route,
      done: !!p.locked && p.tasksDone === p.tasksTotal,
      detail: p.locked ? `任务 ${p.tasksDone}/${p.tasksTotal}` : '待锁定方案',
      target: 'itinerary',
    },
    {
      key: 'settle',
      title: 'AA结算',
      icon: Wallet,
      done: !!p.locked && p.paidCount === p.settleCount,
      detail: `已付 ${p.paidCount}/${p.settleCount} 人`,
      target: 'settle',
    },
  ]
  const currentIdx = steps.findIndex((s) => !s.done)
  const stateOf = (i: number): StepState => (steps[i].done ? 'done' : i === currentIdx ? 'current' : 'todo')

  return (
    <section id="overview" className="pt-6 sm:pt-10">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        {/* 左侧：标语 */}
        <div className="flex flex-col justify-center">
          <span className="section-eyebrow">
            <MapPin className="h-3.5 w-3.5" />
            毕业季 · 多人旅行共识助手
          </span>
          <h1 className="mt-4 text-[28px] font-extrabold leading-[1.15] tracking-tight text-ink-900 min-[375px]:text-[32px] sm:text-[44px]">
            8个人，24种想法，
            <br />
            <span className="relative inline-block">
              <span className="relative z-10">3分钟找到共同答案</span>
              <span className="absolute inset-x-0 bottom-1 z-0 h-3 rounded-sm bg-coral-200/80 sm:bottom-1.5 sm:h-4" />
            </span>
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-7 text-ink-500">
            每个人私下填写真实偏好，系统自动找到大家的最大公约数，并给出
            <span className="font-semibold text-ink-700">可解释</span>
            的组队与行程方案。不用在群里反复接龙，也不用当面开口说“我预算不够”。
          </p>
          <button onClick={p.onDemo} className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full py-1 text-sm font-semibold text-sky-700 hover:text-sky-600 md:hidden">
            <PlayCircle className="h-4 w-4" />
            体验完整流程 · 3分钟看懂
          </button>
          <div className="mt-6 hidden flex-wrap gap-3 sm:flex">
            <button onClick={p.onFill} className="btn-primary">
              <PenLine className="h-4 w-4" />
              {p.hasMine ? '修改我的偏好' : '填写我的偏好'}
            </button>
            <button onClick={() => p.onJump('consensus')} className="btn-ghost px-5 py-3">
              查看共识方案
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 右侧：旅行局票根 */}
        <TripTicket filledCount={p.filledCount} locked={p.locked} />
      </div>

      {/* 四步进度 */}
      <div className="card mt-6 p-4 sm:mt-8 sm:p-5">
        <ol className="grid grid-cols-4 gap-1 sm:gap-3">
          {steps.map((s, i) => {
            const st = stateOf(i)
            const Icon = s.icon
            return (
              <li key={s.key} className="relative">
                {i < steps.length - 1 && (
                  <span
                    aria-hidden
                    className={`dash-route absolute left-[calc(50%+22px)] right-[calc(-50%+22px)] top-[19px] h-0.5 sm:left-[52px] sm:right-2 sm:top-[21px] ${
                      steps[i].done ? 'text-coral-400' : 'text-ink-800/15'
                    }`}
                  />
                )}
                <button
                  onClick={() => p.onJump(s.target)}
                  className="group flex w-full flex-col items-center gap-2 rounded-2xl p-1 text-center sm:flex-row sm:items-start sm:gap-3 sm:p-2 sm:text-left"
                >
                  <span
                    className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition sm:h-11 sm:w-11 ${
                      st === 'done'
                        ? 'bg-coral-500 text-white'
                        : st === 'current'
                          ? 'bg-white text-coral-600 ring-2 ring-coral-500'
                          : 'bg-cream-200 text-ink-400'
                    }`}
                  >
                    {st === 'done' ? <Check className="h-5 w-5" strokeWidth={2.6} /> : <Icon className="h-[18px] w-[18px]" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-mono text-[10px] font-semibold tracking-widest text-ink-400">STEP {i + 1}</span>
                    <span className={`block text-[13px] font-bold sm:text-sm ${st === 'todo' ? 'text-ink-400' : 'text-ink-800'}`}>{s.title}</span>
                    <span
                      className={`mt-0.5 block text-[11px] leading-4 sm:text-xs ${
                        st === 'current' ? 'font-medium text-coral-600' : 'text-ink-400'
                      }`}
                    >
                      {s.detail}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {/* 成员 */}
      <div id="members" className="card mt-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink-900">同行成员</h2>
            <p className="mt-1 text-sm text-ink-500">
              <span className="num font-semibold text-ink-800">{p.filledCount}</span>/{TRIP.total} 人已填写偏好
              {p.filledCount < TRIP.total ? '，还差你一个' : '，全员到齐'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-cream-200 sm:w-44">
              <div className="h-full rounded-full bg-coral-500 transition-all duration-500" style={{ width: `${(p.filledCount / TRIP.total) * 100}%` }} />
            </div>
            <span className="num text-sm font-bold text-coral-600">{Math.round((p.filledCount / TRIP.total) * 100)}%</span>
          </div>
        </div>

        <ul className="mt-5 grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-8">
          {MEMBERS.map((m) => {
            const filled = !m.isMe || p.hasMine
            return (
              <li key={m.id} className="flex flex-col items-center text-center">
                <div className="relative">
                  <Avatar id={m.id} size="lg" />
                  {m.isOrganizer && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white ring-2 ring-white" title="发起人">
                      <Crown className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                  )}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white ${
                      filled ? 'bg-emerald-500 text-white' : 'bg-cream-300 text-ink-500'
                    }`}
                  >
                    {filled ? <Check className="h-3 w-3" strokeWidth={3} /> : <PenLine className="h-2.5 w-2.5" strokeWidth={2.5} />}
                  </span>
                </div>
                <span className="mt-2 text-sm font-semibold text-ink-800">
                  {m.name}
                  {m.isMe && <span className="ml-0.5 text-xs font-medium text-coral-600">（我）</span>}
                </span>
                <span className={`mt-0.5 text-[11px] ${filled ? 'text-ink-400' : 'font-medium text-coral-600'}`}>
                  {filled ? (m.isOrganizer ? '发起人 · 已填写' : '已填写') : '待填写'}
                </span>
              </li>
            )
          })}
        </ul>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-cream-100 p-4 sm:flex-row sm:items-center">
          <Lock className="hidden h-4 w-4 shrink-0 text-ink-400 sm:block" />
          <p className="flex-1 text-[13px] leading-6 text-ink-500">
            成员只能看到彼此的填写状态。预算与敏感条件仅用于系统匹配，不会出现在任何人的页面上。
          </p>
          {!p.hasMine ? (
            <button onClick={p.onFill} className="btn-dark shrink-0 px-4 py-2.5 text-sm">
              <PenLine className="h-4 w-4" />
              填写我的偏好
            </button>
          ) : (
            <button onClick={p.onInvite} className="btn-ghost shrink-0 text-sm">
              <UserPlus className="h-4 w-4" />
              再拉几位同学
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function TripTicket({ filledCount, locked }: { filledCount: number; locked: Scheme | null }) {
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-[28px] bg-white shadow-lift ring-1 ring-ink-800/5">
        {/* 主票面 */}
        <div className="relative px-6 pb-6 pt-5 sm:px-7">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold tracking-[0.2em] text-ink-400">GRADUATION TRIP · 2027</span>
          </div>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-ink-900">{TRIP.name}</h2>

          <div className="mt-5 flex items-center gap-3">
            <div>
              <p className="text-[11px] text-ink-400">出发</p>
              <p className="text-2xl font-extrabold text-ink-900">{TRIP.from}</p>
              <p className="font-mono text-[11px] tracking-widest text-ink-400">SHA</p>
            </div>
            <div className="relative flex flex-1 items-center text-coral-400">
              <span className="dash-route h-0.5 flex-1" />
              <span className="mx-1 flex h-8 w-8 items-center justify-center rounded-full bg-coral-50 text-coral-600">
                <Plane className="h-4 w-4" />
              </span>
              <span className="dash-route h-0.5 flex-1" />
            </div>
            <div className="text-right">
              <p className="text-[11px] text-ink-400">{locked ? '目的地' : '候选目的地'}</p>
              <p className="text-2xl font-extrabold text-ink-900">{locked ? locked.city : '待定'}</p>
              <p className="font-mono text-[11px] tracking-widest text-ink-400">{locked ? locked.cityCode : 'CTU · TAO · CSX'}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {TRIP.candidates.map((c) => (
              <span
                key={c}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${
                  locked?.city === c ? 'bg-coral-500 text-white' : 'bg-cream-100 text-ink-600'
                }`}
              >
                <MapPin className="h-3 w-3" />
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* 撕线 */}
        <div className="relative">
          <span aria-hidden className="absolute -left-4 -top-4 h-8 w-8 rounded-full bg-cream-100 ring-1 ring-ink-800/5" />
          <span aria-hidden className="absolute -right-4 -top-4 h-8 w-8 rounded-full bg-cream-100 ring-1 ring-ink-800/5" />
          <div className="mx-6 border-t-2 border-dashed border-cream-300" />
        </div>

        {/* 存根 */}
        <div className="grid grid-cols-3 gap-3 px-6 pb-6 pt-5 sm:px-7">
          <Field label="发起人" value={TRIP.organizer} />
          <Field label="日期范围" value="6.18 — 6.24" mono />
          <Field label="成员" value={`${TRIP.total} 人`} />
        </div>
        <div className="flex items-center justify-between bg-ink-800 px-6 py-3 sm:px-7">
          <span className="font-mono text-[11px] tracking-[0.25em] text-white/60">邀请码 {TRIP.inviteCode}</span>
          <span aria-hidden className="flex h-5 items-end gap-[2px]">
            {[3, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 3, 1, 2, 1, 3, 1, 2].map((w, i) => (
              <span key={i} className="h-full bg-white/70" style={{ width: w }} />
            ))}
          </span>
        </div>
      </div>

      {/* 日期印章 */}
      <div
        key={filledCount}
        className="pointer-events-none absolute -top-5 right-4 flex h-[84px] w-[84px] animate-stamp flex-col items-center justify-center rounded-full border-[2.5px] border-coral-500/80 bg-white/70 text-coral-600 backdrop-blur-[1px] sm:right-6"
        aria-hidden
      >
        <span className="absolute inset-1.5 rounded-full border border-dashed border-coral-500/60" />
        <span className="num text-[22px] font-black leading-none">{filledCount}/8</span>
        <span className="mt-1 text-[10px] font-bold tracking-widest">已填写</span>
      </div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-ink-400">{label}</p>
      <p className={`mt-0.5 text-[15px] font-bold text-ink-800 ${mono ? 'num font-mono' : ''}`}>{value}</p>
    </div>
  )
}
