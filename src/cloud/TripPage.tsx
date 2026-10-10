import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Crown, Link2, Lock, PenLine, Plane, ShieldCheck, Trash2, UserPlus, Wallet, X } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import PreferenceSheet from '../components/PreferenceSheet'
import { useToast } from '../components/Toast'
import type { MyPrefs } from '../types'
import { linkProps } from '../router'
import { fmtMonthDay, rangeDays } from '../shared/dates'
import { profileOf } from '../shared/destinations'
import type { Preferences, TripView } from '../shared/types'
import { api, ApiClientError } from './api'
import { clearIdentity, loadIdentity, loadInviteCode, loadSnapshot, takeFlag } from './storage'
import { useTripSync } from './sync'
import { ConsensusSection, ItinerarySection, SettleSection } from './TripSections'
import { CloudHeader, MemberDot, PageSkeleton, StateCard, SyncPill } from './ui'

const toSheet = (p: Preferences | null): MyPrefs | null =>
  p ? { dates: p.dates, budget: p.budgetId, destinations: p.destinations, pace: p.pace, stay: p.stay, musts: p.musts, nos: p.nos, submittedAt: '' } : null

export default function TripPage({ slug }: { slug: string }) {
  const toast = useToast()
  const [identity, setIdentity] = useState(() => loadIdentity(slug))
  const { view, status, error, lastSynced, refresh, apply } = useTripSync(slug, identity?.memberToken ?? null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const flagsHandled = useRef(false)

  const readOnly = status === 'snapshot' || (status === 'error' && !!error && error.code !== 'VERSION_CONFLICT')

  // 首次加载完成后处理一次性标记：刚创建 → 弹邀请；刚加入 → 打开偏好表单
  useEffect(() => {
    if (!view || flagsHandled.current) return
    flagsHandled.current = true
    if (takeFlag(slug, 'created')) setInviteOpen(true)
    else if (takeFlag(slug, 'open-prefs') && !view.me.preferences) setSheetOpen(true)
  }, [view, slug])

  // 身份失效：清掉本地身份，引导重新加入
  useEffect(() => {
    if (error?.code === 'UNAUTHORIZED') {
      clearIdentity(slug)
      setIdentity(null)
    }
  }, [error, slug])

  const plans = view?.consensus.plans ?? []
  const lockedId = view?.state.lockedPlanId ?? null
  const currentId = selectedId && (plans.some((p) => p.id === selectedId) || selectedId === lockedId) ? selectedId : lockedId ?? plans[0]?.id ?? null
  const shownPlan = view?.lockedPlan ?? plans.find((p) => p.id === currentId) ?? null

  const dateOptions = useMemo(() => (view ? rangeDays(view.trip.dateStart, view.trip.dateEnd) : []), [view])
  const destOptions = useMemo(
    () => (view ? view.trip.candidateDestinations.map((c) => ({ id: c, name: c, desc: profileOf(c).known ? `单程约 ${profileOf(c).hours} 小时` : '' })) : []),
    [view],
  )

  /** 统一处理写操作：成功直接应用服务端返回的最新视图；版本冲突则刷新后提示重试 */
  async function mutate(key: string, fn: (token: string) => Promise<TripView>, success?: (v: TripView) => void) {
    if (!identity || busy) return
    setBusy(key)
    try {
      const v = await fn(identity.memberToken)
      apply(v)
      success?.(v)
    } catch (e) {
      const err = e as ApiClientError
      if (err.code === 'VERSION_CONFLICT') {
        await refresh()
        toast({ kind: 'info', title: '数据已被其他成员更新', desc: '已为你刷新到最新状态，请再操作一次' })
      } else toast({ kind: 'error', title: '操作失败', desc: err.message })
    } finally {
      setBusy(null)
    }
  }

  if (!identity) {
    return (
      <div className="min-h-screen">
        <CloudHeader />
        <main className="px-4">
          <StateCard title="你还没有加入这个旅行局" desc={loadSnapshot(slug) ? '当前浏览器的成员身份已失效，请用邀请码重新加入。' : '需要发起人提供的邀请码才能查看旅行局的共享信息。'}>
            <a {...linkProps(`/trip/${slug}/join`)} className="btn-primary px-5 py-2.5 text-sm">
              使用邀请码加入
            </a>
            <a {...linkProps('/')} className="btn-ghost px-5 py-2.5 text-sm">
              体验示例旅行局
            </a>
          </StateCard>
        </main>
      </div>
    )
  }
  if (!view) {
    if (status === 'loading') return <PageSkeleton />
    const notFound = error?.code === 'TRIP_NOT_FOUND'
    return (
      <div className="min-h-screen">
        <CloudHeader />
        <main className="px-4">
          <StateCard
            icon={notFound ? 'alert' : 'offline'}
            title={notFound ? '旅行局不存在' : error?.code === 'FORBIDDEN' ? '没有权限查看' : error?.code === 'NOT_CONFIGURED' ? '云端功能尚未配置' : '云端连接失败'}
            desc={error?.message ?? '请检查网络后重试'}
          >
            {!notFound && (
              <button onClick={() => refresh()} className="btn-primary px-5 py-2.5 text-sm">
                重试
              </button>
            )}
            <a {...linkProps('/')} className="btn-ghost px-5 py-2.5 text-sm">
              体验示例旅行局
            </a>
          </StateCard>
        </main>
      </div>
    )
  }

  const { trip, me } = view
  const isOrganizer = me.role === 'organizer'
  const hasMine = !!me.preferences
  const fillPct = trip.memberCount ? Math.round((view.filledCount / trip.memberCount) * 100) : 0

  const submitPrefs = (p: MyPrefs) =>
    mutate(
      'prefs',
      (t) => api.putPreferences(slug, t, { dates: p.dates, budgetId: p.budget, destinations: p.destinations, pace: p.pace, stay: p.stay, musts: p.musts, nos: p.nos }),
      (v) => {
        setSheetOpen(false)
        const best = v.consensus.plans[0]
        toast(
          v.consensus.status === 'ready' && best
            ? { kind: 'success', title: hasMine ? '偏好已更新' : '偏好已提交', desc: `云端已重新计算：最大共识为${best.destination}，${best.participantCount}/${best.memberCount} 人可参加，匹配度 ${best.match}%` }
            : { kind: 'success', title: '偏好已提交', desc: '再有 1 位同学填写，就能生成共识方案' },
        )
      },
    )

  return (
    <div className="min-h-screen pb-28 lg:pb-12">
      <CloudHeader
        right={
          <>
            <SyncPill status={status} lastSynced={lastSynced} onRetry={() => refresh()} />
            <span className="hidden items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink-600 ring-1 ring-ink-800/10 md:inline-flex">
              {isOrganizer && <Crown className="h-3.5 w-3.5 text-amber-500" />}
              {me.displayName} · {isOrganizer ? '发起人' : '成员'}
            </span>
            <button onClick={() => setInviteOpen(true)} aria-label="邀请同学" className="btn-primary h-10 shrink-0 px-3.5 py-0 text-sm min-[400px]:px-4">
              <UserPlus className="h-4 w-4" />
              <span className="hidden min-[400px]:inline">邀请同学</span>
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {readOnly && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-coral-50 p-4 text-sm text-coral-700 ring-1 ring-coral-200" role="alert">
            <span className="flex-1">{status === 'snapshot' ? '云端连接失败，正在使用本地只读快照。' : '云端连接失败，当前显示的是最近一次同步的数据，暂时不能修改。'}</span>
            <button onClick={() => refresh()} className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-coral-700 ring-1 ring-coral-200 hover:bg-coral-100">
              重试
            </button>
          </div>
        )}

        {/* 票根 */}
        <section className="pt-6 sm:pt-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:gap-10">
            <div className="flex flex-col justify-center">
              <span className="section-eyebrow">
                <ShieldCheck className="h-3.5 w-3.5" />
                云端旅行局 · 偏好仅系统可见
              </span>
              <h1 className="mt-3 text-[28px] font-extrabold leading-tight tracking-tight text-ink-900 sm:text-[40px]">{trip.name}</h1>
              <p className="mt-3 text-[15px] leading-7 text-ink-500">
                {trip.organizerName} 发起 · {trip.originCity}出发 · {fmtMonthDay(trip.dateStart)}—{fmtMonthDay(trip.dateEnd)}
              </p>
              <div className="mt-6 hidden flex-wrap gap-3 sm:flex">
                <button onClick={() => setSheetOpen(true)} disabled={readOnly} className="btn-primary">
                  <PenLine className="h-4 w-4" />
                  {hasMine ? '修改我的偏好' : '填写我的偏好'}
                </button>
                <a {...linkProps('/')} className="btn-ghost px-5 py-3">
                  查看示例旅行局
                </a>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-[28px] bg-white shadow-lift ring-1 ring-ink-800/5">
              <div className="px-6 pb-5 pt-5">
                <span className="font-mono text-[11px] font-semibold tracking-[0.2em] text-ink-400">GRADUATION TRIP · LIVE</span>
                <div className="mt-4 flex items-center gap-3">
                  <div>
                    <p className="text-[11px] text-ink-400">出发</p>
                    <p className="text-2xl font-extrabold text-ink-900">{trip.originCity}</p>
                  </div>
                  <div className="flex flex-1 items-center text-coral-400">
                    <span className="dash-route h-0.5 flex-1" />
                    <span className="mx-1 flex h-8 w-8 items-center justify-center rounded-full bg-coral-50 text-coral-600">
                      <Plane className="h-4 w-4" />
                    </span>
                    <span className="dash-route h-0.5 flex-1" />
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-[11px] text-ink-400">{view.lockedPlan ? '目的地' : '候选目的地'}</p>
                    <p className="truncate text-2xl font-extrabold text-ink-900">{view.lockedPlan ? view.lockedPlan.destination : '待定'}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {trip.candidateDestinations.map((c) => (
                    <span key={c} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${view.lockedPlan?.destination === c ? 'bg-coral-500 text-white' : 'bg-cream-100 text-ink-600'}`}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              <div className="relative">
                <span aria-hidden className="absolute -left-4 -top-4 h-8 w-8 rounded-full bg-cream-100" />
                <span aria-hidden className="absolute -right-4 -top-4 h-8 w-8 rounded-full bg-cream-100" />
                <div className="mx-6 border-t-2 border-dashed border-cream-300" />
              </div>
              <div className="grid grid-cols-3 gap-3 px-6 pb-5 pt-4 text-sm">
                <div>
                  <p className="text-[11px] text-ink-400">发起人</p>
                  <p className="mt-0.5 truncate font-bold text-ink-800">{trip.organizerName}</p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-400">日期范围</p>
                  <p className="num mt-0.5 font-bold text-ink-800">
                    {trip.dateStart.slice(5).replace('-', '.')}—{trip.dateEnd.slice(5).replace('-', '.')}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-400">成员</p>
                  <p className="num mt-0.5 font-bold text-ink-800">
                    {trip.memberCount}/{trip.memberLimit} 人
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between bg-ink-800 px-6 py-3 text-[11px] text-white/70">
                <span>{trip.inviteDeadline ? `邀请截止 ${new Date(trip.inviteDeadline).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '邀请长期有效'}</span>
                <span>更新于 {new Date(view.state.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 成员与填写进度 */}
        <section id="members" className="card mt-6 p-5 sm:p-6" aria-labelledby="members-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="members-title" className="text-lg font-bold text-ink-900">
                填写进度
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                <span className="num font-semibold text-ink-800">{view.filledCount}</span>/{trip.memberCount} 位成员已填写偏好 · 上限 {trip.memberLimit} 人
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 w-32 overflow-hidden rounded-full bg-cream-200 sm:w-44">
                <div className="h-full rounded-full bg-coral-500 transition-all duration-500" style={{ width: `${fillPct}%` }} />
              </div>
              <span className="num text-sm font-bold text-coral-600">{fillPct}%</span>
            </div>
          </div>
          <ul className="mt-5 grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-6 lg:grid-cols-8">
            {view.members.map((m) => (
              <li key={m.id} className="group relative flex flex-col items-center text-center">
                <div className="relative">
                  <MemberDot name={m.displayName} color={m.color} size="lg" />
                  {m.role === 'organizer' && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white ring-2 ring-white" title="发起人">
                      <Crown className="h-3 w-3" />
                    </span>
                  )}
                  <span className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white ${m.hasPreferences ? 'bg-emerald-500 text-white' : 'bg-cream-300 text-ink-500'}`}>
                    {m.hasPreferences ? <Check className="h-3 w-3" strokeWidth={3} /> : <PenLine className="h-2.5 w-2.5" />}
                  </span>
                </div>
                <span className="mt-2 max-w-full truncate text-sm font-semibold text-ink-800">
                  {m.displayName}
                  {m.id === me.memberId && <span className="text-xs font-medium text-coral-600">（我）</span>}
                </span>
                <span className={`mt-0.5 text-[11px] ${m.hasPreferences ? 'text-ink-400' : 'font-medium text-coral-600'}`}>{m.hasPreferences ? '已填写' : '待填写'}</span>
                {isOrganizer && m.role !== 'organizer' && !readOnly && (
                  <button onClick={() => setRemoving({ id: m.id, name: m.displayName })} aria-label={`移除成员 ${m.displayName}`} className="absolute -top-1 left-1 hidden rounded-full bg-white p-1 text-ink-400 shadow ring-1 ring-ink-800/10 hover:text-coral-600 group-hover:block focus:block">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-cream-100 p-4 sm:flex-row sm:items-center">
            <p className="flex-1 text-[13px] leading-6 text-ink-500">成员只能看到彼此的填写状态。预算、必选条件和底线条件仅用于服务端匹配，不会返回给任何其他成员。</p>
            <button onClick={() => setSheetOpen(true)} disabled={readOnly} className="btn-dark shrink-0 px-4 py-2.5 text-sm">
              <PenLine className="h-4 w-4" />
              {hasMine ? '修改我的偏好' : '填写我的偏好'}
            </button>
          </div>
        </section>

        <ConsensusSection
          consensus={view.consensus}
          locked={view.lockedPlan}
          selectedId={currentId}
          onSelect={setSelectedId}
          isOrganizer={isOrganizer}
          hasMine={hasMine}
          readOnly={readOnly}
          busy={!!busy}
          onLock={(id) =>
            mutate('lock', (t) => api.lock(slug, t, id, view.state.version), (v) => {
              setSelectedId(id)
              toast({ kind: 'success', title: `已锁定「${v.lockedPlan?.destination}」方案`, desc: '所有成员刷新后会看到相同的锁定结果' })
            })
          }
          onUnlock={() => mutate('lock', (t) => api.lock(slug, t, null, view.state.version), () => toast({ kind: 'info', title: '已取消锁定' }))}
          onFill={() => setSheetOpen(true)}
          onInvite={() => setInviteOpen(true)}
        />

        <ItinerarySection
          plan={shownPlan}
          isLocked={!!view.lockedPlan}
          state={view.state}
          meId={me.memberId}
          isOrganizer={isOrganizer}
          readOnly={readOnly}
          busyKey={busy}
          onToggle={(key, done, label) => mutate(key, (t) => api.setTask(slug, t, key, done, view.state.version), () => toast({ kind: done ? 'success' : 'info', title: done ? '已标记完成' : '已改为待办', desc: label }))}
        />

        <SettleSection
          plan={shownPlan}
          isLocked={!!view.lockedPlan}
          state={view.state}
          members={view.members}
          meId={me.memberId}
          readOnly={readOnly}
          busy={!!busy}
          onTogglePaid={(paid) => mutate('paid', (t) => api.setPaid(slug, t, paid, view.state.version), () => toast({ kind: 'success', title: paid ? '已记录你的付款' : '已撤销付款记录' }))}
        />

        <footer className="mt-16 border-t border-dashed border-cream-300 py-8 text-center text-xs leading-6 text-ink-400">
          共识方案由服务端规则引擎基于成员偏好计算生成，仅供决策参考 · 数据每 10 秒自动同步
        </footer>
      </main>

      {/* 移动端底部主操作 */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-800/5 bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <button onClick={() => setInviteOpen(true)} aria-label="邀请同学" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cream-100 text-ink-700 ring-1 ring-ink-800/10">
            <UserPlus className="h-5 w-5" />
          </button>
          {!hasMine ? (
            <button onClick={() => setSheetOpen(true)} disabled={readOnly} className="btn-primary h-12 flex-1 text-[15px]">
              <PenLine className="h-[18px] w-[18px]" />
              填写我的偏好
            </button>
          ) : isOrganizer && !view.lockedPlan && view.consensus.status === 'ready' && shownPlan?.feasible ? (
            <button onClick={() => shownPlan && mutate('lock', (t) => api.lock(slug, t, shownPlan.id, view.state.version), () => toast({ kind: 'success', title: `已锁定「${shownPlan.destination}」方案` }))} disabled={readOnly || !!busy} className="btn-primary h-12 flex-1 text-[15px]">
              <Lock className="h-[18px] w-[18px]" />
              锁定{shownPlan?.destination}方案
            </button>
          ) : (
            <a href={view.lockedPlan ? '#settle' : '#consensus'} className="btn-primary h-12 flex-1 text-[15px]">
              <Wallet className="h-[18px] w-[18px]" />
              {view.lockedPlan ? '查看AA结算' : '查看共识方案'}
            </a>
          )}
        </div>
      </div>

      <PreferenceSheet
        open={sheetOpen}
        initial={toSheet(me.preferences)}
        onClose={() => setSheetOpen(false)}
        onSubmit={submitPrefs}
        dateOptions={dateOptions}
        destOptions={destOptions}
        busy={busy === 'prefs'}
      />
      <CloudInvite open={inviteOpen} onClose={() => setInviteOpen(false)} slug={slug} trip={view} />
      <ConfirmDialog
        open={!!removing}
        title={`移除成员「${removing?.name ?? ''}」？`}
        desc="对方的偏好会一并删除，共识方案将重新计算。对方需要重新使用邀请码才能再次加入。"
        confirmText="确认移除"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const r = removing
          setRemoving(null)
          if (r) mutate('remove', (t) => api.removeMember(slug, t, r.id), () => toast({ kind: 'success', title: `已移除 ${r.name}` }))
        }}
      />
    </div>
  )
}

function CloudInvite({ open, onClose, slug, trip }: { open: boolean; onClose: () => void; slug: string; trip: TripView }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const code = loadInviteCode(slug)
  const link = `${window.location.origin}/trip/${slug}/join${code ? `#code=${code}` : ''}`
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
      toast({ kind: 'success', title: `${what}已复制`, desc: '发到班级群或私聊给同学即可' })
    } catch {
      toast({ kind: 'error', title: '复制失败', desc: '请长按链接手动复制' })
    }
  }
  return (
    <Modal open={open} onClose={onClose} labelledBy="cloud-invite-title">
      <div className="overflow-hidden rounded-t-[28px] bg-white shadow-lift sm:rounded-[28px]">
        <div className="relative bg-coral-500 px-6 pb-6 pt-5 text-white">
          <button onClick={onClose} aria-label="关闭" className="absolute right-3 top-3 rounded-full p-2 text-white/80 hover:bg-white/15">
            <X className="h-5 w-5" />
          </button>
          <p className="font-mono text-[11px] font-semibold tracking-[0.2em] text-white/70">INVITATION</p>
          <h2 id="cloud-invite-title" className="mt-2 text-2xl font-extrabold">
            邀请同学加入
          </h2>
          <p className="mt-1 text-sm text-white/85">
            {trip.trip.name} · 已加入 {trip.trip.memberCount}/{trip.trip.memberLimit} 人
          </p>
        </div>
        <div className="p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
          {code ? (
            <div className="flex items-center justify-between rounded-2xl bg-cream-100 px-4 py-3 ring-1 ring-cream-300">
              <span className="text-xs text-ink-500">邀请码</span>
              <span className="font-mono text-lg font-black tracking-[0.25em] text-ink-900">{code}</span>
            </div>
          ) : (
            <p className="rounded-2xl bg-cream-100 px-4 py-3 text-xs leading-5 text-ink-500">当前浏览器没有保存邀请码，请向发起人索取后再分享。</p>
          )}
          <label htmlFor="cloud-invite-link" className="mt-4 block text-xs font-semibold text-ink-500">
            邀请链接（邀请码在 # 之后，不会出现在服务器日志中）
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-2xl bg-cream-100 p-1.5 pl-3 ring-1 ring-cream-300">
            <Link2 className="h-4 w-4 shrink-0 text-ink-400" />
            <input id="cloud-invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-ink-700 outline-none" />
            <button data-autofocus onClick={() => copy(link, '邀请链接')} className="btn-dark shrink-0 px-4 py-2 text-sm">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          <p className="mt-4 text-center text-xs leading-5 text-ink-400">同学加入后只能看到填写进度和共识结果，看不到任何人的预算与底线</p>
        </div>
      </div>
    </Modal>
  )
}
