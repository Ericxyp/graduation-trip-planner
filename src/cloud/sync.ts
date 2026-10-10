/**
 * 多人同步（不使用 WebSocket）：
 * - 页面可见时每 5 秒轮询，隐藏时降为 30 秒；窗口获得焦点、网络恢复、其他标签页广播时立即刷新；
 * - 请求进行中不重复发起；revision 未变化时不触发重新渲染，更旧的响应直接丢弃；
 * - 离线（navigator.onLine=false）显示“网络断开”；云端失败时回退到本地只读快照。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TripView } from '../shared/types'
import { api, ApiClientError } from './api'
import { broadcast, loadSnapshot, onBroadcast, saveSnapshot } from './storage'
import type { SyncStatus } from './ui'

export const POLL_VISIBLE_MS = 5_000
export const POLL_HIDDEN_MS = 30_000

export function useTripSync(slug: string, token: string | null, onIdentityChange?: () => void) {
  const [view, setView] = useState<TripView | null>(null)
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [error, setError] = useState<ApiClientError | null>(null)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const inFlight = useRef(false)
  const revision = useRef(-1)
  const alive = useRef(true)
  const viewRef = useRef<TripView | null>(null)
  const identityCb = useRef(onIdentityChange)
  identityCb.current = onIdentityChange

  /** 应用一份新数据：revision 相同则只更新时间，不重新渲染列表；更旧的响应丢弃 */
  const apply = useCallback(
    (v: TripView, opts: { local?: boolean } = {}) => {
      setError(null)
      setStatus('synced')
      setLastSynced(new Date())
      if (v.revision < revision.current) return
      if (v.revision === revision.current && viewRef.current && viewRef.current.me.role === v.me.role) return
      revision.current = v.revision
      viewRef.current = v
      setView(v)
      saveSnapshot(slug, v)
      if (opts.local) broadcast('refresh', slug)
    },
    [slug],
  )

  const refresh = useCallback(async (): Promise<TripView | null> => {
    if (!token || inFlight.current) return null
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus(revision.current >= 0 ? 'offline' : loadSnapshot(slug) ? 'snapshot' : 'offline')
      if (!viewRef.current) {
        const snap = loadSnapshot(slug)
        if (snap) setView((viewRef.current = snap.view))
      }
      return null
    }
    inFlight.current = true
    setStatus((s) => (s === 'loading' ? s : 'syncing'))
    try {
      const v = await api.getTrip(slug, token)
      if (alive.current) apply(v)
      return v
    } catch (e) {
      if (!alive.current) return null
      const err = e instanceof ApiClientError ? e : new ApiClientError('NETWORK', '网络连接失败', 0)
      setError(err)
      const hard = ['UNAUTHORIZED', 'FORBIDDEN', 'TRIP_NOT_FOUND', 'MEMBER_LEFT'].includes(err.code)
      if (!hard) {
        if (!viewRef.current) {
          const snap = loadSnapshot(slug)
          if (snap) setView((viewRef.current = snap.view))
        }
        setStatus(err.code === 'NETWORK' && revision.current >= 0 ? 'offline' : revision.current >= 0 ? 'error' : loadSnapshot(slug) ? 'snapshot' : 'error')
      } else setStatus('error')
      return null
    } finally {
      inFlight.current = false
    }
  }, [slug, token, apply])

  useEffect(() => {
    alive.current = true
    refresh()
    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(
        () => {
          refresh().finally(schedule)
        },
        document.visibilityState === 'visible' ? POLL_VISIBLE_MS : POLL_HIDDEN_MS,
      )
    }
    schedule()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
      schedule()
    }
    const onOnline = () => refresh()
    const onOffline = () => setStatus('offline')
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const off = onBroadcast(slug, (type) => {
      if (type === 'identity') identityCb.current?.()
      else refresh()
    })
    return () => {
      alive.current = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      off()
    }
  }, [refresh, slug])

  return { view, status, error, lastSynced, refresh, apply }
}
