/**
 * 令牌与邀请码：全部使用 Node crypto 生成，数据库只保存 HMAC-SHA256 哈希。
 * 明文 token 只在创建/加入的响应中返回一次。
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去掉易混淆的 0/O/1/I

function randomFrom(alphabet: string, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)]
  return out
}

export function newSlug(): string {
  return randomFrom(SLUG_ALPHABET, 10)
}

export function newInviteCode(): string {
  return randomFrom(CODE_ALPHABET, 8)
}

/** 256 位随机 token，base64url 编码 */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSecret(secret: string, pepper: string, purpose: 'token' | 'invite'): string {
  return createHmac('sha256', `${purpose}:${pepper}`).update(secret).digest('hex')
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase()
}

/** 常量时间比较，避免通过响应时间猜测邀请码 */
export function verifySecret(secret: string, expectedHash: string, pepper: string, purpose: 'token' | 'invite'): boolean {
  const actual = Buffer.from(hashSecret(secret, pepper, purpose), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token)
}
