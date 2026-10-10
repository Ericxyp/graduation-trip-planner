import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

type ToastKind = 'success' | 'info' | 'error'
interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  desc?: string
}

const Ctx = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => {})

export function useToast() {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const timers = useRef(new Set<number>())
  useEffect(() => {
    const set = timers.current
    return () => set.forEach((t) => window.clearTimeout(t))
  }, [])

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), [])

  const push = useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      const id = ++seq.current
      setItems((xs) => [...xs.slice(-2), { ...t, id }])
      const timer = window.setTimeout(() => {
        timers.current.delete(timer)
        dismiss(id)
      }, 3200)
      timers.current.add(timer)
    },
    [dismiss],
  )

  const icon = (k: ToastKind) =>
    k === 'success' ? (
      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
    ) : k === 'error' ? (
      <AlertCircle className="h-5 w-5 shrink-0 text-coral-500" />
    ) : (
      <Info className="h-5 w-5 shrink-0 text-sky-500" />
    )

  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4 sm:top-5"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-2xl bg-ink-800 px-4 py-3 text-white shadow-lift"
          >
            {icon(t.kind)}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-5">{t.title}</p>
              {t.desc && <p className="mt-0.5 text-xs leading-5 text-white/70">{t.desc}</p>}
            </div>
            <button aria-label="关闭提示" onClick={() => dismiss(t.id)} className="-m-1 rounded-full p-1 text-white/60 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
