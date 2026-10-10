import { useCallback, useEffect, useState } from 'react'
import { STORAGE_KEY, defaultState } from './data'
import type { AppState } from './types'

function load(): { state: AppState; restored: boolean; corrupted: boolean } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { state: defaultState(), restored: false, corrupted: false }
    const parsed = JSON.parse(raw) as Partial<AppState>
    if (parsed.version !== 1) return { state: defaultState(), restored: false, corrupted: true }
    const base = defaultState()
    return {
      state: {
        ...base,
        ...parsed,
        exited: { ...base.exited, ...(parsed.exited ?? {}) },
        paid: { ...base.paid, ...(parsed.paid ?? {}) },
        tasks: { ...(parsed.tasks ?? base.tasks) },
      } as AppState,
      restored: true,
      corrupted: false,
    }
  } catch {
    return { state: defaultState(), restored: false, corrupted: true }
  }
}

export function useAppState() {
  const [boot] = useState(load)
  const [state, setState] = useState<AppState>(boot.state)
  const [storageOk, setStorageOk] = useState(true)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      setStorageOk(true)
    } catch {
      setStorageOk(false)
    }
  }, [state])

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), [])
  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setState(defaultState())
  }, [])

  return { state, update, reset, storageOk, restored: boot.restored, corrupted: boot.corrupted }
}
