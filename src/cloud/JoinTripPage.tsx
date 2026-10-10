import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CalendarDays, MapPin, Plane, Users } from 'lucide-react'
import { useToast } from '../components/Toast'
import { linkProps, navigate } from '../router'
import { fmtMonthDay } from '../shared/dates'
import type { PublicTrip } from '../shared/types'
import { api, ApiClientError } from './api'
import { loadIdentity, saveIdentity, saveInviteCode, setFlag } from './storage'
import { BackLink, CloudHeader, Field, inputCls, PageSkeleton, StateCard } from './ui'

/** 读取 URL fragment 中的邀请码（#code=XXXX）后立即从地址栏移除，避免被复制或截图泄漏 */
function codeFromHash(): string {
  const m = /(?:^#|&)code=([A-Za-z0-9]{6,12})/.exec(window.location.hash)
  return m ? m[1].toUpperCase() : ''
}

export default function JoinTripPage({ slug }: { slug: string }) {
  const toast = useToast()
  const [trip, setTrip] = useState<PublicTrip | null>(null)
  const [loadError, setLoadError] = useState<ApiClientError | null>(null)
  const [code, setCode] = useState(codeFromHash)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ field: 'name' | 'code' | 'form'; msg: string } | null>(null)
  const submitting = useRef(false)
  const existing = loadIdentity(slug)

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])

  useEffect(() => {
    let alive = true
    api
      .getPublic(slug)
      .then((r) => alive && setTrip(r.trip))
      .catch((e: ApiClientError) => alive && setLoadError(e))
    return () => {
      alive = false
    }
  }, [slug])

  if (existing) {
    return (
      <div className="min-h-screen">
        <CloudHeader />
        <main className="px-4">
          <StateCard icon="ok" title="你已经在这个旅行局里了" desc="当前浏览器保存了你的成员身份，可以直接进入。">
            <a {...linkProps(`/trip/${slug}`)} className="btn-primary px-6 py-2.5 text-sm">
              进入旅行局
            </a>
          </StateCard>
        </main>
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="min-h-screen">
        <CloudHeader />
        <main className="px-4">
          <StateCard title={loadError.code === 'TRIP_NOT_FOUND' ? '旅行局不存在' : '暂时无法加载旅行局'} desc={loadError.message}>
            <a {...linkProps('/')} className="btn-ghost px-5 py-2.5 text-sm">
              体验示例旅行局
            </a>
            {loadError.code !== 'TRIP_NOT_FOUND' && (
              <button onClick={() => window.location.reload()} className="btn-primary px-5 py-2.5 text-sm">
                重试
              </button>
            )}
          </StateCard>
        </main>
      </div>
    )
  }
  if (!trip) return <PageSkeleton />

  const closed = trip.inviteExpired || trip.isFull || trip.status === 'archived'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const n = name.trim()
    if (!n || n.length > 16) return setError({ field: 'name', msg: '昵称需为 1–16 个字' })
    if (!/^[A-Za-z0-9]{6,12}$/.test(code.trim())) return setError({ field: 'code', msg: '请输入发起人提供的邀请码' })
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    try {
      const r = await api.join(slug, n, code.trim().toUpperCase())
      saveIdentity(slug, r.identity)
      saveInviteCode(slug, code.trim().toUpperCase())
      setFlag(slug, 'open-prefs')
      toast({ kind: 'success', title: `已加入「${r.trip.name}」`, desc: '先私下填写你的偏好吧' })
      navigate(`/trip/${slug}`)
    } catch (err) {
      const ae = err instanceof ApiClientError ? err : null
      const msg = ae?.message ?? '加入失败，请稍后重试'
      const field = ae?.code === 'DISPLAY_NAME_TAKEN' ? 'name' : ae?.code === 'INVALID_INVITE_CODE' ? 'code' : 'form'
      setError({ field, msg })
      if (ae?.code === 'MEMBER_LIMIT_REACHED' || ae?.code === 'INVITE_EXPIRED') api.getPublic(slug).then((r) => setTrip(r.trip)).catch(() => {})
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen pb-16">
      <CloudHeader />
      <main className="mx-auto max-w-lg px-4 pt-6 sm:pt-10">
        <BackLink />
        <div className="relative mt-5 overflow-hidden rounded-[28px] bg-white shadow-lift ring-1 ring-ink-800/5">
          <div className="bg-coral-500 px-6 pb-6 pt-5 text-white">
            <p className="font-mono text-[11px] font-semibold tracking-[0.2em] text-white/70">INVITATION</p>
            <h1 className="mt-2 text-2xl font-extrabold">{trip.name}</h1>
            <p className="mt-1 text-sm text-white/85">{trip.organizerName} 邀请你一起毕业旅行</p>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <span className="font-bold">{trip.originCity}</span>
              <span className="dash-route h-0.5 flex-1 text-white/60" />
              <Plane className="h-4 w-4" />
              <span className="dash-route h-0.5 flex-1 text-white/60" />
              <span className="truncate font-bold">{trip.candidateDestinations.join(' / ')}</span>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-3 px-6 py-4 text-sm">
            <div>
              <dt className="flex items-center gap-1 text-[11px] text-ink-400">
                <CalendarDays className="h-3 w-3" />
                日期
              </dt>
              <dd className="num mt-0.5 font-bold text-ink-800">
                {fmtMonthDay(trip.dateStart)}—{fmtMonthDay(trip.dateEnd)}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[11px] text-ink-400">
                <Users className="h-3 w-3" />
                已加入
              </dt>
              <dd className="num mt-0.5 font-bold text-ink-800">
                {trip.memberCount}/{trip.memberLimit} 人
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[11px] text-ink-400">
                <MapPin className="h-3 w-3" />
                候选地
              </dt>
              <dd className="mt-0.5 font-bold text-ink-800">{trip.candidateDestinations.length} 个</dd>
            </div>
          </dl>
          {trip.inviteDeadline && (
            <p className="border-t border-dashed border-cream-300 px-6 py-3 text-xs text-ink-500">
              邀请截止：{new Date(trip.inviteDeadline).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {closed ? (
          <StateCard title={trip.isFull ? '旅行局人数已满' : '邀请已过期'} desc={trip.isFull ? '可以请发起人调整人数上限，或移除未参加的成员。' : '请联系发起人获取新的邀请。'} />
        ) : (
          <form onSubmit={submit} noValidate className="card mt-4 space-y-5 p-5 sm:p-6" aria-busy={busy}>
            <Field label="你的昵称" hint="同局内不能重名" htmlFor="nick" error={error?.field === 'name' ? error.msg : undefined}>
              <input id="nick" className={inputCls} value={name} maxLength={16} autoComplete="nickname" placeholder="例如：阿哲" onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="邀请码" hint={code ? '已从邀请链接自动填入' : '向发起人索取'} htmlFor="code" error={error?.field === 'code' ? error.msg : undefined}>
              <input id="code" className={`${inputCls} font-mono uppercase tracking-[0.2em]`} value={code} maxLength={12} autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </Field>
            {error?.field === 'form' && (
              <p className="rounded-xl bg-coral-50 px-4 py-3 text-sm text-coral-700 ring-1 ring-coral-200" role="alert">
                {error.msg}
              </p>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full py-3.5 text-[15px]">
              {busy ? '正在加入…' : '加入并填写偏好'}
            </button>
            <p className="text-center text-xs leading-5 text-ink-400">预算和底线条件仅用于系统匹配，其他成员看不到。</p>
          </form>
        )}
      </main>
    </div>
  )
}
