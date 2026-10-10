import { RotateCcw, Ticket } from 'lucide-react'

export default function Footer({ onReset }: { onReset: () => void }) {
  return (
    <footer className="mt-20 border-t border-dashed border-cream-300 py-10">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-800 text-white">
            <Ticket className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink-800">毕业搭子局</p>
            <p className="text-xs text-ink-400">共识方案由规则引擎基于成员偏好计算生成，仅供决策参考</p>
          </div>
        </div>
        <button onClick={onReset} className="btn-ghost text-sm">
          <RotateCcw className="h-4 w-4" />
          重置演示数据
        </button>
      </div>
    </footer>
  )
}
