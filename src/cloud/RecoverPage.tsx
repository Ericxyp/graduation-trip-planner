import { useRef, useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { useToast } from '../components/Toast'
import { navigate } from '../router'
import { api, ApiClientError } from './api'
import { saveIdentity } from './storage'
import { BackLink, CloudHeader, Field, inputCls } from './ui'

/** 从旅行局链接或直接输入中提取 slug */
function slugFrom(input: string): string | null {
  const s = input.trim()
  const m = /\/trip\/([a-z0-9]{6,32})/.exec(s) ?? /^([a-z0-9]{6,32})$/.exec(s)
  return m ? m[1] : null
}

/**
 * 发起人身份恢复：在新设备输入旅行局链接（或编号）与恢复码。
 * 恢复码只通过 POST 请求体发送，不进入 URL、浏览器历史或服务器日志。
 */
export default function RecoverPage({ slug: initialSlug }: { slug?: string }) {
  const toast = useToast()
  const [trip, setTrip] = useState(initialSlug ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ field: 'trip' | 'code' | 'form'; msg: string } | null>(null)
  const submitting = useRef(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const slug = slugFrom(trip)
    if (!slug) return setError({ field: 'trip', msg: '请粘贴旅行局链接，或输入链接中 /trip/ 后面的编号' })
    const normalized = code.replace(/[\s-]/g, '').toUpperCase()
    if (!/^[A-Z0-9]{16}$/.test(normalized)) return setError({ field: 'code', msg: '恢复码为 16 位字母和数字，例如 ABCD-EFGH-JKLM-NPQR' })
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    try {
      const r = await api.recoverOrganizer(slug, normalized)
      saveIdentity(slug, r.identity)
      setCode('')
      toast({ kind: 'success', title: '已恢复发起人身份', desc: '其他设备上的登录状态不受影响' })
      navigate(`/trip/${slug}`)
    } catch (err) {
      const ae = err instanceof ApiClientError ? err : null
      setError({ field: ae?.code === 'INVALID_RECOVERY_CODE' ? 'code' : ae?.code === 'TRIP_NOT_FOUND' ? 'trip' : 'form', msg: ae?.message ?? '恢复失败，请稍后重试' })
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
        <span className="mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <KeyRound className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-[26px] font-extrabold tracking-tight text-ink-900">找回发起人身份</h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">换手机或清除了浏览器数据？输入创建旅行局时保存的恢复码，在这台设备上重新获得发起人权限。原设备上的身份仍然有效。</p>
        <form onSubmit={submit} noValidate className="card mt-6 space-y-5 p-5 sm:p-6" aria-busy={busy}>
          <Field label="旅行局链接或编号" htmlFor="rc-trip" error={error?.field === 'trip' ? error.msg : undefined}>
            <input id="rc-trip" className={inputCls} value={trip} autoComplete="off" placeholder="https://…/trip/xxxxxxxxxx" onChange={(e) => setTrip(e.target.value)} />
          </Field>
          <Field label="恢复码" hint="不区分大小写，可带短横线" htmlFor="rc-code" error={error?.field === 'code' ? error.msg : undefined}>
            <input id="rc-code" className={`${inputCls} font-mono uppercase tracking-[0.15em]`} value={code} maxLength={24} autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
          {error?.field === 'form' && (
            <p className="rounded-xl bg-coral-50 px-4 py-3 text-sm text-coral-700 ring-1 ring-coral-200" role="alert">
              {error.msg}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full py-3.5 text-[15px]">
            {busy ? '正在验证…' : '恢复发起人身份'}
          </button>
          <p className="text-center text-xs leading-5 text-ink-400">为防止猜测，同一网络 15 分钟内最多尝试 5 次。</p>
        </form>
      </main>
    </div>
  )
}
