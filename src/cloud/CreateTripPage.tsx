import { useEffect, useRef, useState, type FormEvent } from "react"
import { CalendarDays, CloudOff, Minus, Plus, Sparkles, Users, X } from 'lucide-react'
import { useToast } from '../components/Toast'
import { navigate } from '../router'
import { rangeDays } from '../shared/dates'
import type { HealthView } from '../shared/types'
import { api, ApiClientError } from './api'
import { saveIdentity, saveInviteCode, setFlag } from './storage'
import { BackLink, CloudHeader, Field, inputCls } from './ui'

const SUGGESTED = ['成都', '青岛', '长沙', '重庆', '西安', '厦门', '大理', '杭州']

interface Form {
  name: string
  organizerName: string
  originCity: string
  candidates: string[]
  dateStart: string
  dateEnd: string
  memberLimit: number
  inviteDeadline: string
}

function validate(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {}
  if (f.name.trim().length < 2 || f.name.trim().length > 40) e.name = '名称需为 2–40 个字'
  if (!f.organizerName.trim() || f.organizerName.trim().length > 16) e.organizerName = '昵称需为 1–16 个字'
  if (!f.originCity.trim() || f.originCity.trim().length > 20) e.originCity = '请填写出发城市'
  if (f.candidates.length < 2 || f.candidates.length > 5) e.candidates = '请选择 2–5 个候选目的地'
  if (!f.dateStart || !f.dateEnd) e.dateStart = '请选择日期范围'
  else if (f.dateEnd < f.dateStart) e.dateStart = '结束日期不能早于开始日期'
  else if (rangeDays(f.dateStart, f.dateEnd).length > 30) e.dateStart = '日期范围最长 30 天'
  if (!Number.isInteger(f.memberLimit) || f.memberLimit < 2 || f.memberLimit > 30) e.memberLimit = '人数需在 2–30 之间'
  if (f.inviteDeadline && new Date(f.inviteDeadline).getTime() <= Date.now()) e.inviteDeadline = '截止时间需晚于现在'
  return e
}

export default function CreateTripPage() {
  const toast = useToast()
  const [health, setHealth] = useState<HealthView | null | 'loading'>('loading')
  const [f, setF] = useState<Form>({
    name: '',
    organizerName: '',
    originCity: '上海',
    candidates: ['成都', '青岛', '长沙'],
    dateStart: '2027-06-18',
    dateEnd: '2027-06-24',
    memberLimit: 8,
    inviteDeadline: '',
  })
  const [custom, setCustom] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState('')
  const submitting = useRef(false)

  useEffect(() => {
    let alive = true
    api.healthRaw().then((h) => alive && setHealth(h))
    return () => {
      alive = false
    }
  }, [])

  const errors = validate(f)
  const cloudReady = health !== 'loading' && health?.database === 'ok'
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }))

  const toggleCity = (c: string) =>
    set('candidates', f.candidates.includes(c) ? f.candidates.filter((x) => x !== c) : f.candidates.length >= 5 ? f.candidates : [...f.candidates, c])

  const addCustom = () => {
    const c = custom.trim()
    if (!c) return
    if (/[|@/#~<>]/.test(c) || c.length > 20) return toast({ kind: 'error', title: '城市名不合法', desc: '最多 20 个字，不能包含特殊符号' })
    if (f.candidates.length >= 5) return toast({ kind: 'error', title: '最多选择 5 个候选目的地' })
    if (!f.candidates.includes(c)) set('candidates', [...f.candidates, c])
    setCustom('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setServerError('')
    if (Object.keys(errors).length || submitting.current || !cloudReady) return
    submitting.current = true
    setBusy(true)
    try {
      const r = await api.createTrip({
        name: f.name.trim(),
        organizerName: f.organizerName.trim(),
        originCity: f.originCity.trim(),
        candidateDestinations: f.candidates,
        dateStart: f.dateStart,
        dateEnd: f.dateEnd,
        memberLimit: f.memberLimit,
        inviteDeadline: f.inviteDeadline ? new Date(f.inviteDeadline).toISOString() : null,
      })
      saveIdentity(r.trip.slug, r.identity)
      saveInviteCode(r.trip.slug, r.invite.code)
      setFlag(r.trip.slug, 'created')
      toast({ kind: 'success', title: '旅行局已创建', desc: '把邀请链接发给同学吧' })
      navigate(`/trip/${r.trip.slug}`)
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : '创建失败，请稍后重试'
      setServerError(msg)
      toast({ kind: 'error', title: '创建失败', desc: msg })
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const err = (k: keyof Form) => (touched ? errors[k] : undefined)

  return (
    <div className="min-h-screen pb-16">
      <CloudHeader />
      <main className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-10">
        <BackLink />
        <span className="section-eyebrow mt-5 flex">
          <Sparkles className="h-3.5 w-3.5" />
          发起真实旅行局
        </span>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-tight text-ink-900 sm:text-[34px]">创建旅行局</h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">创建后会生成邀请链接。同学加入并私下填写偏好，系统在云端计算共识方案，所有人看到的是同一份结果。</p>

        {health === 'loading' ? (
          <div className="mt-6 h-14 animate-pulse rounded-2xl bg-white/70" />
        ) : !cloudReady ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-coral-50 p-4 ring-1 ring-coral-200" role="alert">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-coral-600" />
            <div className="text-sm leading-6 text-coral-700">
              <p className="font-bold">{health?.database === 'unreachable' ? '数据库暂时不可用' : '云端功能尚未配置'}</p>
              <p className="text-coral-700">
                {health === null ? '无法连接云端服务（本地 vite dev 不包含 API，请使用 vercel dev）。' : health.database === 'unreachable' ? '请稍后再试。' : '需要在 Vercel 中连接 Neon 数据库并配置 DATABASE_URL。'}
                示例旅行局仍可完整体验。
              </p>
            </div>
          </div>
        ) : null}

        <form onSubmit={submit} noValidate className="card mt-6 space-y-6 p-5 sm:p-7" aria-busy={busy}>
          <Field label="旅行局名称" htmlFor="name" error={err('name')}>
            <input id="name" className={inputCls} value={f.name} maxLength={40} placeholder="例如：2027届毕业旅行" onChange={(e) => set('name', e.target.value)} />
          </Field>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="你的昵称" hint="将作为发起人显示" htmlFor="org" error={err('organizerName')}>
              <input id="org" className={inputCls} value={f.organizerName} maxLength={16} placeholder="例如：小林" onChange={(e) => set('organizerName', e.target.value)} />
            </Field>
            <Field label="出发城市" htmlFor="origin" error={err('originCity')}>
              <input id="origin" className={inputCls} value={f.originCity} maxLength={20} onChange={(e) => set('originCity', e.target.value)} />
            </Field>
          </div>

          <Field label="候选目的地" hint={`已选 ${f.candidates.length}/5，至少 2 个`} error={err('candidates')}>
            <div className="flex flex-wrap gap-2">
              {[...new Set([...SUGGESTED, ...f.candidates])].map((c) => {
                const on = f.candidates.includes(c)
                return (
                  <button
                    type="button"
                    key={c}
                    aria-pressed={on}
                    onClick={() => toggleCity(c)}
                    className={`inline-flex items-center gap-1 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${on ? 'bg-coral-500 text-white' : 'bg-white text-ink-700 ring-1 ring-ink-800/10 hover:ring-coral-300'}`}
                  >
                    {c}
                    {on && <X className="h-3.5 w-3.5 opacity-80" />}
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className={inputCls}
                value={custom}
                maxLength={20}
                placeholder="其他城市，回车添加"
                aria-label="添加其他候选城市"
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustom()
                  }
                }}
              />
              <button type="button" onClick={addCustom} className="btn-ghost shrink-0 px-4 text-sm">
                添加
              </button>
            </div>
          </Field>

          <Field label="日期范围" hint="同学会在这个范围内选择可出发日期" error={err('dateStart')}>
            <div className="grid grid-cols-2 gap-3">
              <label className="relative block">
                <span className="sr-only">开始日期</span>
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input type="date" className={`${inputCls} pl-9`} value={f.dateStart} onChange={(e) => set('dateStart', e.target.value)} />
              </label>
              <label className="relative block">
                <span className="sr-only">结束日期</span>
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input type="date" className={`${inputCls} pl-9`} value={f.dateEnd} min={f.dateStart} onChange={(e) => set('dateEnd', e.target.value)} />
              </label>
            </div>
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="预计人数" hint="2–30 人（含你）" error={err('memberLimit')}>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="减少人数" onClick={() => set('memberLimit', Math.max(2, f.memberLimit - 1))} className="flex h-12 w-12 items-center justify-center rounded-xl bg-white ring-1 ring-ink-800/10 hover:bg-cream-50">
                  <Minus className="h-4 w-4" />
                </button>
                <div className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white text-lg font-black text-ink-900 ring-1 ring-ink-800/10">
                  <Users className="h-4 w-4 text-ink-400" />
                  <span className="num">{f.memberLimit}</span>
                </div>
                <button type="button" aria-label="增加人数" onClick={() => set('memberLimit', Math.min(30, f.memberLimit + 1))} className="flex h-12 w-12 items-center justify-center rounded-xl bg-white ring-1 ring-ink-800/10 hover:bg-cream-50">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </Field>
            <Field label="邀请截止时间" hint="可选" htmlFor="deadline" error={err('inviteDeadline')}>
              <input id="deadline" type="datetime-local" className={inputCls} value={f.inviteDeadline} onChange={(e) => set('inviteDeadline', e.target.value)} />
            </Field>
          </div>

          {serverError && (
            <p className="rounded-xl bg-coral-50 px-4 py-3 text-sm text-coral-700 ring-1 ring-coral-200" role="alert">
              {serverError}
            </p>
          )}
          {touched && Object.keys(errors).length > 0 && <p className="text-center text-xs font-medium text-coral-600">还有 {Object.keys(errors).length} 项需要完善</p>}

          <button type="submit" disabled={busy || !cloudReady} className="btn-primary w-full py-3.5 text-[15px]">
            {busy ? '正在创建…' : '创建并生成邀请链接'}
          </button>
          <p className="text-center text-xs leading-5 text-ink-400">创建后，你的发起人身份只保存在当前浏览器中，请不要清除浏览器数据。</p>
        </form>
      </main>
    </div>
  )
}
