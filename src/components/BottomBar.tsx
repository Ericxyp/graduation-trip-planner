import { Lock, PenLine, UserPlus, Wallet } from 'lucide-react'

interface Props {
  hasMine: boolean
  locked: boolean
  selectedCity: string
  onFill: () => void
  onLock: () => void
  onSettle: () => void
  onInvite: () => void
}

export default function BottomBar({ hasMine, locked, selectedCity, onFill, onLock, onSettle, onInvite }: Props) {
  let label: string
  let Icon = PenLine
  let action: () => void
  if (!hasMine) {
    label = '填写我的偏好'
    action = onFill
  } else if (!locked) {
    label = `锁定${selectedCity}方案`
    Icon = Lock
    action = onLock
  } else {
    label = '查看AA结算'
    Icon = Wallet
    action = onSettle
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-800/5 bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <button onClick={onInvite} aria-label="邀请同学" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cream-100 text-ink-700 ring-1 ring-ink-800/10 active:scale-95">
          <UserPlus className="h-5 w-5" />
        </button>
        <button onClick={action} className="btn-primary h-12 flex-1 text-[15px]">
          <Icon className="h-[18px] w-[18px]" />
          {label}
        </button>
      </div>
    </div>
  )
}
