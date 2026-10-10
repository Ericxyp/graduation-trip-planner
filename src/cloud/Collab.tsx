/**
 * 阶段三协作组件：状态导航、最近动态、退出反馈、恢复码弹层、发起人管理面板、退出确认。
 */
import { useEffect, useState } from 'react'
import { Activity, ArrowRight, Check, Copy, KeyRound, LogOut, PauseCircle, PlayCircle, RefreshCw, Settings2, ShieldAlert, UserCog, X } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import type { ActivityView, InviteStatus, LeaveSummary, MemberSummary, TripView } from '../shared/types'

/* ---------------- 状态导航 ---------------- */

export function StageNav({ view }: { view: TripView }) {
  const steps = [
    { id: 'members', label: '成员与偏好', done: view.filledCount >= Math.max(2, view.members.length) },
    { id: 'consensus', label: '共识方案', done: view.consensus.status === 'ready' },
    { id: 'itinerary', label: '锁定行程', done: !!view.lockedPlan },
    { id: 'ledger', label: '实际费用', done: view.ledger.expenses.length > 0 },
    { id: 'activity', label: '最近动态', done: false },
  ]
  const current = steps.findIndex((s) => !s.done)
  return (
    <nav aria-label="旅行局进度" className="sticky top-16 z-30 -mx-4 border-b border-ink-800/5 bg-cream-100/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6">
      <ol className="no-scrollbar flex gap-1 overflow-x-auto py-2">
        {steps.map((s, i) => (
          <li key={s.id} className="flex shrink-0 items-center gap-1">
            <a
              href={`#${s.id}`}
              aria-current={i === current ? 'step' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                s.done ? 'text-emerald-700 hover:bg-white' : i === current ? 'bg-coral-500 text-white' : 'text-ink-500 hover:bg-white'
              }`}
            >
              {s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className="num text-[11px] opacity-70">{i + 1}</span>}
              {s.label}
            </a>
            {i < steps.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-ink-300" aria-hidden />}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/* ---------------- 最近动态 ---------------- */

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export function ActivitySection({ items }: { items: ActivityView[] }) {
  return (
    <section id="activity" className="pt-12 sm:pt-16" aria-labelledby="activity-title">
      <span className="section-eyebrow">
        <Activity className="h-3.5 w-3.5" />
        Activity
      </span>
      <h2 id="activity-title" className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-[28px]">
        最近动态
      </h2>
      <p className="mt-2 text-sm text-ink-500">最近 20 条。只记录发生了什么，不包含任何人的预算、底线或邀请码。</p>
      <div className="card mt-5 p-5 sm:p-6">
        {items.length === 0 ? (
          <p className="text-sm text-ink-500">还没有动态。邀请同学加入后，这里会显示加入、填写和锁定等进展。</p>
        ) : (
          <ol className="relative space-y-4 pl-5">
            <span aria-hidden className="absolute bottom-2 left-[5px] top-2 w-0 border-l-2 border-dashed border-cream-300" />
            {items.map((a) => (
              <li key={a.id} className="relative">
                <span aria-hidden className={`absolute -left-5 top-1.5 h-3 w-3 rounded-full ring-2 ring-white ${a.type.startsWith('member_left') || a.type === 'member_removed' ? 'bg-coral-400' : a.type.startsWith('expense') ? 'bg-amber-400' : a.type === 'plan_locked' ? 'bg-emerald-500' : 'bg-sky-400'}`} />
                <p className="text-sm leading-6 text-ink-700">{a.text}</p>
                <p className="text-xs text-ink-400">
                  <time dateTime={a.at}>{ago(a.at)}</time>
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

/* ---------------- 成员退出后的变化反馈 ---------------- */

export function LeaveFeedbackCard({ s, onClose }: { s: LeaveSummary; onClose: () => void }) {
  const fmt = (n: number) => `¥${n.toLocaleString('zh-CN')}`
  return (
    <div role="status" className="mt-4 flex animate-slide-up flex-col gap-3 rounded-3xl bg-white p-5 shadow-card ring-1 ring-coral-200 sm:flex-row sm:items-start">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-coral-50 text-coral-600">
        <LogOut className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-ink-900">{s.name}已退出旅行局</p>
        <ul className="num mt-2 grid gap-x-6 gap-y-1 text-[13px] text-ink-600 sm:grid-cols-2">
          <li>
            参加人数：{s.countBefore} → <b className="text-ink-900">{s.countAfter}</b>
          </li>
          <li>
            人均费用：{fmt(s.perPersonBefore)} → <b className="text-ink-900">{fmt(s.perPersonAfter)}</b>
          </li>
          <li>{s.reassigned > 0 ? `${s.reassigned} 项任务已重新分配` : '没有需要重新分配的任务'}</li>
          <li>{s.lockedDestination ? `${s.lockedDestination}方案保持锁定` : s.planDestination ? `共识方案已按 ${s.countAfter} 人重新计算` : '共识方案已重新计算'}</li>
        </ul>
        <p className="mt-2 text-xs text-ink-400">已记录的实际费用不会被删除，{s.name}的垫付与分摊仍保留在台账中。</p>
      </div>
      <button onClick={onClose} aria-label="关闭退出提示" className="self-start rounded-full p-1.5 text-ink-400 hover:bg-cream-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/* ---------------- 恢复码（一次性展示） ---------------- */

export function RecoveryCodeDialog({ code, onDone }: { code: string | null; onDone: () => void }) {
  const toast = useToast()
  const [saved, setSaved] = useState(false)
  useEffect(() => setSaved(false), [code])
  return (
    <Modal open={!!code} onClose={() => saved && onDone()} labelledBy="recovery-title">
      <div className="rounded-t-[28px] bg-white p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-lift sm:rounded-[28px]">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <KeyRound className="h-6 w-6" />
        </span>
        <h2 id="recovery-title" className="mt-4 text-lg font-extrabold text-ink-900">
          保存你的发起人恢复码
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-500">换手机、清除浏览器数据后，用它在新设备上找回发起人身份。恢复码只显示这一次，系统只保存加密后的指纹，无法再次查看。</p>
        <div className="mt-4 rounded-2xl bg-cream-100 px-4 py-4 text-center ring-1 ring-cream-300">
          <p className="select-all font-mono text-xl font-black tracking-[0.18em] text-ink-900 sm:text-2xl">{code}</p>
        </div>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code ?? '')
              toast({ kind: 'success', title: '恢复码已复制', desc: '建议保存到备忘录或密码管理器' })
            } catch {
              toast({ kind: 'error', title: '复制失败', desc: '请手动抄写恢复码' })
            }
          }}
          className="btn-ghost mt-3 w-full py-2.5 text-sm"
        >
          <Copy className="h-4 w-4" />
          复制恢复码
        </button>
        <label className="mt-4 flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 h-4 w-4 accent-coral-500" />
          我已妥善保存，不会发到群里
        </label>
        <button data-autofocus onClick={onDone} disabled={!saved} className="btn-primary mt-4 w-full py-3 text-[15px]">
          继续
        </button>
      </div>
    </Modal>
  )
}

/* ---------------- 发起人管理面板 ---------------- */

const INVITE_LABEL: Record<InviteStatus, { text: string; cls: string }> = {
  open: { text: '邀请开放', cls: 'bg-emerald-50 text-emerald-700' },
  paused: { text: '已暂停', cls: 'bg-amber-50 text-amber-700' },
  expired: { text: '已过期', cls: 'bg-coral-50 text-coral-700' },
  full: { text: '人数已满', cls: 'bg-sky-50 text-sky-700' },
  closed: { text: '已解散', cls: 'bg-cream-200 text-ink-600' },
}

export function InviteStatusBadge({ status }: { status: InviteStatus }) {
  const s = INVITE_LABEL[status]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>{s.text}</span>
}

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AdminPanel(p: {
  view: TripView
  busy: boolean
  readOnly: boolean
  onInvite: (action: 'regenerate' | 'pause' | 'resume') => void
  onDeadline: (iso: string | null) => void
  onResetRecovery: () => void
  onTransfer: (m: MemberSummary) => void
  onArchive: () => void
}) {
  const { view } = p
  const [confirm, setConfirm] = useState<null | 'regenerate' | 'recovery' | 'archive' | { transfer: MemberSummary }>(null)
  const [deadline, setDeadline] = useState(toLocalInput(view.trip.inviteDeadline))
  const [target, setTarget] = useState('')
  useEffect(() => setDeadline(toLocalInput(view.trip.inviteDeadline)), [view.trip.inviteDeadline])
  const others = view.members.filter((m) => m.id !== view.me.memberId)
  const disabled = p.busy || p.readOnly || view.trip.status === 'archived'
  const paused = view.admin?.invitePaused

  return (
    <section id="admin" className="card mt-4 p-5 sm:p-6" aria-labelledby="admin-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="admin-title" className="flex items-center gap-2 text-lg font-bold text-ink-900">
          <Settings2 className="h-5 w-5 text-ink-500" />
          发起人管理
        </h2>
        <InviteStatusBadge status={view.trip.inviteStatus} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 rounded-2xl bg-cream-50 p-4 ring-1 ring-cream-200">
          <p className="text-sm font-bold text-ink-800">邀请</p>
          <p className="mt-1 text-xs leading-5 text-ink-500">重新生成后旧邀请码立即失效；已加入的成员不受影响。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setConfirm('regenerate')} disabled={disabled} className="btn-ghost px-3 py-2 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              重新生成邀请码
            </button>
            <button onClick={() => p.onInvite(paused ? 'resume' : 'pause')} disabled={disabled} className="btn-ghost px-3 py-2 text-xs">
              {paused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
              {paused ? '恢复邀请' : '暂停邀请'}
            </button>
          </div>
          <label className="mt-3 block text-xs font-semibold text-ink-500" htmlFor="admin-deadline">
            截止时间
          </label>
          <div className="mt-1.5 flex gap-2">
            <input id="admin-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-0 min-w-0 flex-1 rounded-xl bg-white px-2.5 py-2 text-sm ring-1 ring-ink-800/10 outline-none focus:ring-2 focus:ring-sky-400" />
            <button onClick={() => p.onDeadline(deadline ? new Date(deadline).toISOString() : null)} disabled={disabled} className="btn-dark shrink-0 px-3 py-2 text-xs">
              保存
            </button>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl bg-cream-50 p-4 ring-1 ring-cream-200">
          <p className="text-sm font-bold text-ink-800">发起人恢复码</p>
          <p className="mt-1 text-xs leading-5 text-ink-500">
            {view.admin?.hasRecoveryCode ? '已设置。换设备时可用它找回发起人身份；遗失后可在此重新生成。' : '还没有恢复码。建议立即生成并妥善保存，否则清除浏览器数据后将无法管理旅行局。'}
          </p>
          {!view.admin?.hasRecoveryCode && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <ShieldAlert className="h-3.5 w-3.5" />
              尚未设置恢复码
            </p>
          )}
          <button onClick={() => setConfirm('recovery')} disabled={disabled} className="btn-ghost mt-3 px-3 py-2 text-xs">
            <KeyRound className="h-3.5 w-3.5" />
            {view.admin?.hasRecoveryCode ? '重新生成恢复码' : '生成恢复码'}
          </button>
        </div>

        <div className="min-w-0 rounded-2xl bg-cream-50 p-4 ring-1 ring-cream-200">
          <p className="text-sm font-bold text-ink-800">转让或解散</p>
          <p className="mt-1 text-xs leading-5 text-ink-500">发起人不能直接退出。转让后你会成为普通成员，可以再退出。</p>
          <div className="mt-3 flex gap-2">
            <select aria-label="选择新的发起人" value={target} onChange={(e) => setTarget(e.target.value)} className="w-0 min-w-0 flex-1 rounded-xl bg-white px-2.5 py-2 text-sm ring-1 ring-ink-800/10 outline-none" disabled={disabled || !others.length}>
              <option value="">{others.length ? '选择成员' : '暂无其他成员'}</option>
              {others.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const m = others.find((x) => x.id === target)
                if (m) setConfirm({ transfer: m })
              }}
              disabled={disabled || !target}
              className="btn-ghost shrink-0 px-3 py-2 text-xs"
            >
              <UserCog className="h-3.5 w-3.5" />
              转让
            </button>
          </div>
          <button onClick={() => setConfirm('archive')} disabled={disabled} className="mt-3 text-xs font-semibold text-coral-700 hover:underline disabled:opacity-50">
            解散旅行局
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm === 'regenerate'
            ? '重新生成邀请码？'
            : confirm === 'recovery'
              ? view.admin?.hasRecoveryCode
                ? '重新生成恢复码？'
                : '生成发起人恢复码？'
              : confirm === 'archive'
                ? '解散旅行局？'
                : confirm
                  ? `把发起人转让给「${confirm.transfer.displayName}」？`
                  : ''
        }
        desc={
          confirm === 'regenerate'
            ? '旧邀请码和旧邀请链接会立即失效，还没加入的同学需要使用新链接。已加入的成员不受影响。'
            : confirm === 'recovery'
              ? '新的恢复码只显示一次，旧恢复码会立即失效。'
              : confirm === 'archive'
                ? '解散后所有人只能查看，不能再加入、填写或记账。此操作目前不能撤销。'
                : '转让后对方获得锁定方案、管理邀请等权限，你会成为普通成员；旧的恢复码会失效，由新发起人重新生成。'
        }
        confirmText="确认"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm
          setConfirm(null)
          if (c === 'regenerate') p.onInvite('regenerate')
          else if (c === 'recovery') p.onResetRecovery()
          else if (c === 'archive') p.onArchive()
          else if (c) p.onTransfer(c.transfer)
        }}
      />
    </section>
  )
}

/* ---------------- 成员退出 ---------------- */

export function LeaveConfirm({ open, isOrganizer, onCancel, onConfirm }: { open: boolean; isOrganizer: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (isOrganizer)
    return (
      <ConfirmDialog
        open={open}
        title="发起人不能直接退出"
        desc="请先在“发起人管理”中把发起人身份转让给其他成员，或者解散旅行局。"
        confirmText="知道了"
        onCancel={onCancel}
        onConfirm={onCancel}
      />
    )
  return (
    <ConfirmDialog
      open={open}
      title="确定退出这个旅行局？"
      desc="退出后：你的个人偏好将停止参与共识计算；你负责的任务会重新分配给其他成员；AA 账单会按剩余人数重新计算；已记录的实际费用（包括你的垫付）不会被自动删除。退出后需要重新使用邀请码才能再加入。"
      confirmText="确认退出"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

