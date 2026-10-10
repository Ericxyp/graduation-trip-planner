import { useEffect, useState } from 'react'

/** 轻量路由：不引入 React Router，只支持本项目的 4 种路径 */
export type Route =
  | { name: 'demo' }
  | { name: 'create' }
  | { name: 'trip'; slug: string }
  | { name: 'join'; slug: string }
  | { name: 'recover'; slug?: string }
  | { name: 'notfound' }

export function parseRoute(pathname: string): Route {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/') return { name: 'demo' }
  if (p === '/create') return { name: 'create' }
  if (p === '/recover') return { name: 'recover' }
  let m = /^\/trip\/([a-z0-9]{6,32})\/join$/.exec(p)
  if (m) return { name: 'join', slug: m[1] }
  m = /^\/trip\/([a-z0-9]{6,32})\/recover$/.exec(p)
  if (m) return { name: 'recover', slug: m[1] }
  m = /^\/trip\/([a-z0-9]{6,32})$/.exec(p)
  if (m) return { name: 'trip', slug: m[1] }
  return { name: 'notfound' }
}

const EVT = 'app:navigate'

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  window.dispatchEvent(new Event(EVT))
  window.scrollTo({ top: 0 })
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname))
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', on)
    window.addEventListener(EVT, on)
    return () => {
      window.removeEventListener('popstate', on)
      window.removeEventListener(EVT, on)
    }
  }, [])
  return route
}

/** 站内链接：拦截点击走前端路由，保留新标签页打开等默认行为 */
export function linkProps(to: string) {
  return {
    href: to,
    onClick: (e: { preventDefault: () => void; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; button: number }) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      navigate(to)
    },
  }
}
