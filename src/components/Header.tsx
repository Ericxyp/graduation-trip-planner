import { RotateCcw, Ticket, UserPlus } from 'lucide-react'

const NAV = [
  { id: 'overview', label: '总览' },
  { id: 'consensus', label: '共识方案' },
  { id: 'itinerary', label: '行程' },
  { id: 'settle', label: 'AA结算' },
]

export default function Header({ onInvite, onReset }: { onInvite: () => void; onReset: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-800/5 bg-cream-100/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a href="#overview" className="flex items-center gap-2.5" aria-label="毕业搭子局 首页">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-500 text-white shadow-[0_4px_12px_-4px_rgba(232,80,47,0.7)]">
            <Ticket className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <span className="leading-tight">
            <span className="block text-[17px] font-extrabold tracking-tight text-ink-900">毕业搭子局</span>
            <span className="hidden font-mono text-[10px] tracking-[0.2em] text-ink-400 sm:block">GRAD TRIP · CONSENSUS</span>
          </span>
        </a>

        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="页面导航">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-500 transition hover:bg-white hover:text-ink-800"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onReset}
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-500 transition hover:bg-white hover:text-ink-800"
            aria-label="重置演示数据"
            title="重置演示数据"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden lg:inline">重置演示数据</span>
          </button>
          <button onClick={onInvite} className="btn-primary h-10 px-4 py-0 text-sm">
            <UserPlus className="h-4 w-4" />
            邀请同学
          </button>
        </div>
      </div>
    </header>
  )
}
