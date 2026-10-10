import { useState } from 'react'
import { Check, Copy, Link2, Plane, X } from 'lucide-react'
import { MEMBERS, TRIP } from '../data'
import Avatar from './Avatar'
import Modal from './Modal'
import { useToast } from './Toast'

async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export default function InviteDialog({ open, onClose, filledCount }: { open: boolean; onClose: () => void; filledCount: number }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/?join=${TRIP.inviteCode}`
  const message = `【毕业搭子局】${TRIP.organizer}邀请你加入「${TRIP.name}」，${TRIP.from}出发，候选${TRIP.candidates.join('/')}，6月18日—6月24日。1分钟私下填偏好，系统帮大家找共同答案：${link}`

  const onCopy = async (text: string, what: string) => {
    const ok = await copyText(text)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
      toast({ kind: 'success', title: `${what}已复制`, desc: '发到班级群或私聊给同学即可' })
    } else {
      toast({ kind: 'error', title: '复制失败', desc: '请长按链接手动复制' })
    }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="invite-title">
      <div className="overflow-hidden rounded-t-[28px] bg-white shadow-lift sm:rounded-[28px]">
        <div className="relative bg-coral-500 px-6 pb-7 pt-6 text-white">
          <button onClick={onClose} aria-label="关闭" className="absolute right-3 top-3 rounded-full p-2 text-white/80 hover:bg-white/15 hover:text-white">
            <X className="h-5 w-5" />
          </button>
          <p className="font-mono text-[11px] font-semibold tracking-[0.2em] text-white/70">INVITATION · {TRIP.inviteCode}</p>
          <h2 id="invite-title" className="mt-2 text-2xl font-extrabold">
            邀请同学加入
          </h2>
          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="font-bold">{TRIP.from}</span>
            <span className="dash-route h-0.5 flex-1 text-white/60" />
            <Plane className="h-4 w-4" />
            <span className="dash-route h-0.5 flex-1 text-white/60" />
            <span className="font-bold">{TRIP.candidates.join(' / ')}</span>
          </div>
        </div>
        <div className="p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {MEMBERS.map((m) => (
                <Avatar key={m.id} id={m.id} size="sm" />
              ))}
            </div>
            <p className="text-xs text-ink-500">
              已有 {MEMBERS.length} 人在局中，{filledCount} 人已填写
            </p>
          </div>

          <label className="mt-5 block text-xs font-semibold text-ink-500" htmlFor="invite-link">
            邀请链接
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-2xl bg-cream-100 p-1.5 pl-3 ring-1 ring-cream-300">
            <Link2 className="h-4 w-4 shrink-0 text-ink-400" />
            <input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-ink-700 outline-none" />
            <button onClick={() => onCopy(link, '邀请链接')} className="btn-dark shrink-0 px-4 py-2 text-sm">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>

          <button onClick={() => onCopy(message, '邀请文案')} className="btn-ghost mt-3 w-full py-3 text-sm">
            复制带说明的群聊文案
          </button>
          <p className="mt-4 text-center text-xs leading-5 text-ink-400">同学通过链接加入后，只会看到行程与填写进度，看不到任何人的预算</p>
        </div>
      </div>
    </Modal>
  )
}
