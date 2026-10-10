import { RotateCcw } from 'lucide-react'
import Modal from './Modal'

interface Props {
  open: boolean
  title: string
  desc: string
  confirmText: string
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmDialog({ open, title, desc, confirmText, onCancel, onConfirm }: Props) {
  return (
    <Modal open={open} onClose={onCancel} labelledBy="confirm-title">
      <div className="rounded-t-[28px] bg-white p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-lift sm:rounded-[28px]">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-coral-50 text-coral-600">
          <RotateCcw className="h-6 w-6" />
        </span>
        <h2 id="confirm-title" className="mt-4 text-lg font-extrabold text-ink-900">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-500">{desc}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="btn-ghost py-3">
            再想想
          </button>
          <button onClick={onConfirm} className="btn-primary py-3">
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}
