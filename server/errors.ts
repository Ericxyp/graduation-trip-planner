import type { ApiErrorCode } from '../src/shared/types.js'

const STATUS: Record<ApiErrorCode, number> = {
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  TRIP_NOT_FOUND: 404,
  MEMBER_NOT_FOUND: 404,
  PLAN_NOT_FOUND: 404,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  INVALID_INVITE_CODE: 403,
  INVITE_EXPIRED: 410,
  MEMBER_LIMIT_REACHED: 409,
  DISPLAY_NAME_TAKEN: 409,
  VERSION_CONFLICT: 409,
  RATE_LIMITED: 429,
  NOT_CONFIGURED: 503,
  DATABASE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
}

/** 业务错误：message 面向用户，绝不包含 SQL、token 或堆栈 */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  constructor(code: ApiErrorCode, message: string, status?: number) {
    super(message)
    this.code = code
    this.status = status ?? STATUS[code]
  }
}
