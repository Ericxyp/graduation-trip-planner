/** 数据库抽象：生产使用 Neon（neonDb.ts），测试可注入任意实现。所有参数均为位置参数，绝不拼接用户输入。 */
export type Row = Record<string, unknown>

export interface Stmt {
  text: string
  params: unknown[]
}

export interface Db {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>
  /** 非交互式事务：按顺序在同一事务中执行，任一失败则整体回滚 */
  transaction(stmts: Stmt[]): Promise<Row[][]>
}

export const stmt = (text: string, params: unknown[] = []): Stmt => ({ text, params })

/** Postgres 错误码（SQLSTATE），用于把约束冲突映射成业务错误 */
export function pgCode(err: unknown): string | null {
  const c = (err as { code?: unknown } | null)?.code
  return typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c) ? c : null
}
