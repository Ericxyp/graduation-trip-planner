/**
 * 多人同步：轻量轮询（可见时每 10 秒），重新获得焦点立即刷新；
 * 请求进行中不重复发起；用 revision 丢弃过期响应；失败时回退到本地只读快照。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TripView } from '../shared/types'
import { api, ApiClientError } from './api'
import { loadSnapshot, saveSnapshot } from './storage'
import type { SyncStatus } from './ui'

export const POLL_MS = 10_000

export function useTripSync(slug: string, token: string | null) {
  const [view, setView] = useState<TripView | null>(null)
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [error, setError] = useState<ApiClientError | null>(null)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const inFlight = useRef(false)
  const revision = useRef(-1)
  const alive = useRef(true)

  /** 应用一份新数据：revision 更旧的响应直接丢弃 */
  const apply = useCallback(
    (v: TripView) => {
      if (v.revision < revision.current) return
      revision.current = v.revision
      setView(v)
      setError(null)
      setStatus('synced')
      setLastSynced(new Date())
      saveSnapshot(slug, v)
    },
    [slug],
  )

  const refresh = useCallback(async () => {
    if (!token || inFlight.current) return
    inFlight.current = true
    setStatus((s) => (s === 'loading' ? s : 'syncing'))
    try {
      const v = await api.getTrip(slug, token)
      if (alive.current) apply(v)
    } catch (e) {
      if (!alive.current) return
      const err = e instanceof ApiClientError ? e : new ApiClientError('NETWORK', '网络连接失败', 0)
      setError(err)
      // 身份/旅行局类错误不回退快照；网络或服务端故障时回退到只读快照
      const hard = ['UNAUTHORIZED', 'FORBIDDEN', 'TRIP_NOT_FOUND'].includes(err.code)
      if (!hard) {
        setView((cur) => {
          if (cur) return cur
          const snap = loadSnapshot(slug)
          return snap ? snap.view : null
        })
        setStatus(revision.current >= 0 ? 'error' : loadSnapshot(slug) ? 'snapshot' : 'error')
      } else setStatus('error')
    } finally {
      inFlight.current = false
    }
  }, [slug, token, apply])

  useEffect(() => {
    alive.current = true
    refresh()
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    const onOnline = () => refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      alive.current = false
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh])

  return { view, status, error, lastSynced, refresh, apply }
}
