import type { ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, CloudOff, Loader2, RefreshCw, Ticket } from 'lucide-react'
import { linkProps } from '../router'

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <a {...linkProps(to)} className="flex items-center gap-2.5" aria-label="毕业搭子局 首页">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-500 text-white shadow-[0_4px_12px_-4px_rgba(232,80,47,0.7)]">
        <Ticket className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <span className="leading-tight">
        <span className="block whitespace-nowrap text-[17px] font-extrabold tracking-tight text-ink-900">毕业搭子局</span>
        <span className="hidden font-mono text-[10px] tracking-[0.2em] text-ink-400 sm:block">GRAD TRIP · CLOUD</span>
      </span>
    </a>
  )
}

export function CloudHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-800/5 bg-cream-100/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <div className="ml-auto flex min-w-0 items-center gap-2">{right}</div>
      </div>
    </header>
  )
}

export function BackLink({ to = '/', label = '返回示例旅行局' }: { to?: string; label?: string }) {
  return (
    <a {...linkProps(to)} className="inline-flex items-center gap-1 rounded-full py-1 text-sm font-medium text-ink-500 hover:text-ink-800">
      <ArrowLeft className="h-4 w-4" />
      {label}
    </a>
  )
}

export function MemberDot({ name, color, size = 'md', dim = false }: { name: string; color: string; size?: 'sm' | 'md' | 'lg'; dim?: boolean }) {
  const cls = size === 'lg' ? 'h-14 w-14 text-base' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm'
  return (
    <span aria-hidden className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white ring-2 ring-white ${cls} ${dim ? 'opacity-40 grayscale' : ''}`} style={{ backgroundColor: color }}>
      {Array.from(name).slice(-1)[0] ?? '?'}
    </span>
  )
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen" aria-busy="true" aria-label="正在加载">
      <CloudHeader />
      <main className="mx-auto max-w-6xl animate-pulse px-4 pt-8 sm:px-6">
        <div className="h-4 w-40 rounded bg-cream-300" />
        <div className="mt-4 h-9 w-72 max-w-full rounded-lg bg-cream-300" />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="h-56 rounded-3xl bg-white/80" />
          <div className="h-56 rounded-3xl bg-white/80" />
        </div>
        <div className="mt-4 h-28 rounded-3xl bg-white/80" />
        <div className="mt-4 h-72 rounded-3xl bg-white/80" />
      </main>
    </div>
  )
}

export function StateCard({ icon = 'alert', title, desc, children }: { icon?: 'alert' | 'offline' | 'ok'; title: string; desc?: ReactNode; children?: ReactNode }) {
  const Icon = icon === 'offline' ? CloudOff : icon === 'ok' ? CheckCircle2 : AlertTriangle
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center sm:p-8">
      <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${icon === 'ok' ? 'bg-emerald-50 text-emerald-600' : 'bg-coral-50 text-coral-600'}`}>
        <Icon className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-lg font-extrabold text-ink-900">{title}</h1>
      {desc && <p className="mt-2 text-sm leading-6 text-ink-500">{desc}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  )
}

export type SyncStatus = 'loading' | 'synced' | 'syncing' | 'error' | 'snapshot'

export function SyncPill({ status, lastSynced, onRetry }: { status: SyncStatus; lastSynced: Date | null; onRetry: () => void }) {
  const time = lastSynced ? lastSynced.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
  if (status === 'error' || status === 'snapshot')
    return (
      <button onClick={onRetry} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-coral-50 px-3 text-xs font-semibold text-coral-700 ring-1 ring-coral-200 hover:bg-coral-100" aria-label="同步失败，点击重试">
        <CloudOff className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{status === 'snapshot' ? '离线快照' : '同步失败'} · </span>重试
      </button>
    )
  return (
    <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-ink-500 ring-1 ring-ink-800/10" role="status" aria-live="polite">
      {status === 'synced' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : status === 'syncing' ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-sky-500" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      <span className="hidden sm:inline">{status === 'synced' ? `已同步 ${time}` : status === 'syncing' ? '正在同步' : '加载中'}</span>
      <span className="sm:hidden">{status === 'synced' ? '已同步' : '同步中'}</span>
    </span>
  )
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[15px] font-bold text-ink-900">
        {label}
        {hint && <span className="text-xs font-normal text-ink-400">{hint}</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs font-medium text-coral-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export const inputCls =
  'w-full rounded-xl bg-white px-3.5 py-3 text-[15px] text-ink-800 ring-1 ring-ink-800/10 outline-none transition placeholder:text-ink-300 focus:ring-2 focus:ring-sky-400 disabled:bg-cream-100'
