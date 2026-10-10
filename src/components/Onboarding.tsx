import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, ClipboardList, Route, Sparkles, X } from 'lucide-react'

const STEPS = [
  { icon: ClipboardList, title: '填写个人偏好', desc: '日期、预算和底线默认仅系统可见' },
  { icon: Sparkles, title: '比较共识方案', desc: '同时看到参与人数、匹配度、预算和主要冲突' },
  { icon: Route, title: '锁定行程并AA', desc: '统一负责人和行程，成员退出后自动重算费用' },
]

interface Props {
  /** 有其他弹层时暂时隐藏，不叠加 */
  suspended: boolean
  onDismiss: () => void
  onStart: () => void
}

/** 首次访问的三步轻量引导：底部小卡片，不遮挡页面主体 */
export default function Onboarding({ suspended, onDismiss, onStart }: Props) {
  const [step, setStep] = useState(0)
  const titleId = useId()
  const primaryRef = useRef<HTMLButtonElement>(null)
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    if (suspended) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [suspended])

  if (suspended) return null
  const s = STEPS[step]
  const Icon = s.icon
  const last = step === STEPS.length - 1

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 animate-slide-up sm:inset-x-auto sm:right-6 sm:w-[360px] lg:bottom-6"
    >
      <div className="relative overflow-hidden rounded-3xl bg-white shadow-lift ring-1 ring-ink-800/10">
        <div className="flex items-center justify-between bg-coral-500 px-5 py-2.5 text-white">
          <span className="font-mono text-[11px] font-semibold tracking-[0.2em]">新手引导 · {step + 1}/3</span>
          <button onClick={onDismiss} aria-label="关闭引导" className="-mr-1.5 rounded-full p-1.5 text-white/80 hover:bg-white/15 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative">
          <span aria-hidden className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-cream-100" />
          <span aria-hidden className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-cream-100" />
        </div>

        <div className="px-5 pb-5 pt-4" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-extrabold text-ink-900">
                {step + 1}. {s.title}
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-ink-500">{s.desc}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex gap-1.5" aria-hidden>
              {STEPS.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-coral-500' : i < step ? 'w-1.5 bg-coral-300' : 'w-1.5 bg-cream-300'}`} />
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={onDismiss} className="rounded-full px-3 py-2 text-sm font-medium text-ink-500 hover:bg-cream-100 hover:text-ink-800">
                跳过
              </button>
              <button
                ref={primaryRef}
                onClick={() => (last ? onStart() : setStep((x) => x + 1))}
                className="btn-primary px-4 py-2 text-sm"
              >
                {last ? '开始体验' : '下一步'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
