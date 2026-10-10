/** 生产数据库：Neon Serverless Postgres（HTTP 驱动）。只在服务端引用。 */
import { neon } from '@neondatabase/serverless'
import type { Db, Row, Stmt } from './db.js'

let cached: { url: string; db: Db } | null = null

export function neonDb(url: string): Db {
  if (cached?.url === url) return cached.db
  const sql = neon(url)
  const db: Db = {
    async query<T extends Row = Row>(text: string, params: unknown[] = []) {
      return (await sql.query(text, params)) as T[]
    },
    async transaction(stmts: Stmt[]) {
      return (await sql.transaction(stmts.map((s) => sql.query(s.text, s.params)))) as Row[][]
    },
  }
  cached = { url, db }
  return db
}
