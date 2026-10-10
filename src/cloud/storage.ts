/**
 * 云端旅行局的本地存储：按 tripSlug 隔离，与演示模式的 biye-dazi-ju:v1 完全分开。
 * identity 只包含 memberId / memberToken / role 三个字段。
 */
import type { Identity, TripView } from '../shared/types'

const idKey = (slug: string) => `grad-trip:identity:${slug}`
const inviteKey = (slug: string) => `grad-trip:invite:${slug}`
const snapKey = (slug: string) => `grad-trip:snapshot:${slug}`
const flagKey = (slug: string, flag: string) => `grad-trip:flag:${flag}:${slug}`

function read<T>(k: string, store: Storage = localStorage): T | null {
  try {
    const raw = store.getItem(k)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(k: string, v: unknown, store: Storage = localStorage) {
  try {
    store.setItem(k, JSON.stringify(v))
  } catch {
    /* 存储不可用时忽略 */
  }
}
function remove(k: string, store: Storage = localStorage) {
  try {
    store.removeItem(k)
  } catch {
    /* ignore */
  }
}

export function loadIdentity(slug: string): Identity | null {
  const v = read<Identity>(idKey(slug))
  if (!v || typeof v.memberToken !== 'string' || typeof v.memberId !== 'string' || (v.role !== 'organizer' && v.role !== 'member')) return null
  return { memberId: v.memberId, memberToken: v.memberToken, role: v.role }
}
export function saveIdentity(slug: string, id: Identity) {
  write(idKey(slug), { memberId: id.memberId, memberToken: id.memberToken, role: id.role })
  broadcast('identity', slug)
}
export function clearIdentity(slug: string) {
  remove(idKey(slug))
  remove(snapKey(slug))
  broadcast('identity', slug)
}

export const loadInviteCode = (slug: string) => read<string>(inviteKey(slug))
export const saveInviteCode = (slug: string, code: string) => write(inviteKey(slug), code)

export const loadSnapshot = (slug: string) => read<{ view: TripView; savedAt: string }>(snapKey(slug))
export const saveSnapshot = (slug: string, view: TripView) => write(snapKey(slug), { view, savedAt: new Date().toISOString() })

/** 一次性标记（会话级）：例如“刚创建完，弹出邀请”“刚加入，打开偏好表单” */
export function setFlag(slug: string, flag: string) {
  write(flagKey(slug, flag), 1, sessionStorage)
}
export function takeFlag(slug: string, flag: string): boolean {
  const v = read<number>(flagKey(slug, flag), sessionStorage)
  remove(flagKey(slug, flag), sessionStorage)
  return v === 1
}

/* ---------------- 多标签页同步（BroadcastChannel） ---------------- */
type TabMessage = { type: 'identity' | 'refresh'; slug: string }
let channel: BroadcastChannel | null = null
function ch(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  return (channel ??= new BroadcastChannel('grad-trip'))
}
/** 通知同一浏览器的其他标签页：身份变化或数据已更新（只传 slug 与类型，不传任何秘密） */
export function broadcast(type: TabMessage['type'], slug: string) {
  try {
    ch()?.postMessage({ type, slug } satisfies TabMessage)
  } catch {
    /* ignore */
  }
}
export function onBroadcast(slug: string, fn: (type: TabMessage['type']) => void): () => void {
  const c = ch()
  if (!c) return () => {}
  const h = (e: MessageEvent<TabMessage>) => e.data?.slug === slug && fn(e.data.type)
  c.addEventListener('message', h)
  return () => c.removeEventListener('message', h)
}

/** 新建旅行局后一次性展示恢复码：只存于当前标签页的 sessionStorage，展示后立即删除 */
export function stashRecoveryCode(slug: string, code: string) {
  try {
    sessionStorage.setItem(`grad-trip:recovery-once:${slug}`, code)
  } catch {
    /* ignore */
  }
}
export function takeRecoveryCode(slug: string): string | null {
  try {
    const k = `grad-trip:recovery-once:${slug}`
    const v = sessionStorage.getItem(k)
    sessionStorage.removeItem(k)
    return v
  } catch {
    return null
  }
}

/** 已读到的最新动态 id（用于识别“新发生的成员退出”并展示变化反馈） */
export const loadSeenActivity = (slug: string) => read<number>(`grad-trip:seen-activity:${slug}`) ?? 0
export const saveSeenActivity = (slug: string, id: number) => write(`grad-trip:seen-activity:${slug}`, id)
