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
}
export function clearIdentity(slug: string) {
  remove(idKey(slug))
  remove(snapKey(slug))
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
