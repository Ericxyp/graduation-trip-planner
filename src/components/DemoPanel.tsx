import { useEffect, useRef } from 'react'
import { GitCompareArrows, Lock, PenLine, RotateCcw, UserMinus, X, type LucideIcon } from 'lucide-react'

export type DemoAction = 'prefill' | 'compare' | 'lock' | 'exit' | 'reset'

const ACTIONS: { id: DemoAction; icon: LucideIcon; title: string; desc: string }[] = [
  { id: 'prefill', icon: PenLine, title: '填写推荐偏好', desc: '打开表单并预填一组偏好，由你确认提交' },
  { id: 'compare', icon: GitCompareArrows, title: '比较三个方案', desc: '跳到共识方案，对比人数、预算与冲突' },
  { id: 'lock', icon: Lock, title: '锁定成都方案', desc: '锁定后生成行程，并跳到每日时间轴' },
  { id: 'exit', icon: UserMinus, title: '模拟成员退出', desc: '让一位同学临时退出，查看人均费用变化' },
  { id: 'reset', icon: RotateCcw, title: '重置演示数据', desc: '恢复到 7/8 人已填写的初始状态' },
]

interface Props {
  open: boolean
  onClose: () => void
  onAction: (a: DemoAction) => void
}

/** 演示快捷入口：轻量面板，每次只执行一个动作，不自动播放 */
export default function DemoPanel({ open, onClose, onAction }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const prevFocus = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('button[data-action]')?.focus({ preventScroll: true }), 30)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      prevFocus?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null
  return (
    <>
      {/* 移动端遮罩不覆盖底部操作栏 */}
      <div className="fixed inset-x-0 top-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[45] animate-fade-in bg-ink-900/30 lg:bottom-0" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-title"
        className="fixed inset-x-3 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[46] max-h-[calc(100dvh-170px)] animate-slide-up overflow-y-auto rounded-3xl bg-white shadow-lift ring-1 ring-ink-800/10 sm:inset-x-auto sm:right-6 sm:w-[380px] lg:bottom-auto lg:top-20 lg:max-h-[calc(100dvh-100px)]"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h2 id="demo-title" className="text-base font-extrabold text-ink-900">
              体验完整流程
            </h2>
            <p className="mt-0.5 text-xs text-ink-400">选择想看的环节，每次只执行一个操作。以下操作仅影响当前浏览器。</p>
          </div>
          <button onClick={onClose} aria-label="关闭演示面板" className="-mr-1.5 rounded-full p-1.5 text-ink-400 hover:bg-cream-100 hover:text-ink-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="space-y-1 px-2.5 pb-3">
          {ACTIONS.map((a, i) => {
            const Icon = a.icon
            const danger = a.id === 'reset'
            return (
              <li key={a.id}>
                <button
                  data-action={a.id}
                  onClick={() => onAction(a.id)}
                  className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition hover:bg-cream-100 focus-visible:bg-cream-100"
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-cream-200 text-ink-500' : 'bg-coral-50 text-coral-600'}`}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink-800">
                      {danger ? '' : `${i + 1}. `}
                      {a.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-ink-500">{a.desc}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </>
  )
}
