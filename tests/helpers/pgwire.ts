/**
 * 测试专用的极简 Postgres 客户端（简单查询协议 + 字面量参数替换）。
 * 只用于连接本地/测试数据库运行集成测试，生产代码使用 @neondatabase/serverless。
 * 支持 trust / cleartext / md5 / SCRAM-SHA-256 认证，无任何第三方依赖。
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import { connect, type Socket } from 'node:net'
import type { Db, Row, Stmt } from '../../server/db.js'

class PgError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

function literal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return `'${s.replace(/'/g, "''")}'`
}

export function inlineParams(text: string, params: unknown[]): string {
  return text.replace(/\$(\d+)/g, (_, n) => literal(params[Number(n) - 1]))
}

function parseValue(oid: number, raw: string | null): unknown {
  if (raw === null) return null
  if (oid === 16) return raw === 't'
  if ([20, 21, 23, 700, 701, 1700].includes(oid)) return Number(raw)
  if (oid === 114 || oid === 3802) return JSON.parse(raw)
  return raw
}

class Conn {
  private buf = Buffer.alloc(0)
  private waiters: (() => void)[] = []
  constructor(private sock: Socket) {
    sock.on('data', (d) => {
      this.buf = Buffer.concat([this.buf, typeof d === "string" ? Buffer.from(d) : d])
      this.waiters.splice(0).forEach((w) => w())
    })
  }
  private async readMsg(): Promise<{ type: string; body: Buffer }> {
    for (;;) {
      if (this.buf.length >= 5) {
        const len = this.buf.readInt32BE(1)
        if (this.buf.length >= len + 1) {
          const type = String.fromCharCode(this.buf[0])
          const body = this.buf.subarray(5, len + 1)
          this.buf = this.buf.subarray(len + 1)
          return { type, body }
        }
      }
      await new Promise<void>((r) => this.waiters.push(r))
    }
  }
  private send(type: string | null, body: Buffer) {
    const head = Buffer.alloc(type ? 5 : 4)
    if (type) {
      head.write(type, 0)
      head.writeInt32BE(body.length + 4, 1)
    } else head.writeInt32BE(body.length + 4, 0)
    this.sock.write(Buffer.concat([head, body]))
  }
  private static fields(body: Buffer): Record<string, string> {
    const out: Record<string, string> = {}
    let i = 0
    while (i < body.length && body[i] !== 0) {
      const k = String.fromCharCode(body[i])
      const end = body.indexOf(0, i + 1)
      out[k] = body.subarray(i + 1, end).toString('utf8')
      i = end + 1
    }
    return out
  }
  async startup(user: string, password: string, database: string) {
    const kv = Buffer.from(`user\0${user}\0database\0${database}\0client_encoding\0UTF8\0\0`, 'utf8')
    const ver = Buffer.alloc(4)
    ver.writeInt32BE(196608)
    this.send(null, Buffer.concat([ver, kv]))
    let scram: { nonce: string; first: string; expectedSig?: Buffer } | null = null
    for (;;) {
      const m = await this.readMsg()
      if (m.type === 'E') {
        const f = Conn.fields(m.body)
        throw new PgError(f.M, f.C)
      }
      if (m.type === 'R') {
        const kind = m.body.readInt32BE(0)
        if (kind === 0) continue
        if (kind === 3) this.send('p', Buffer.from(`${password}\0`))
        else if (kind === 5) {
          const salt = m.body.subarray(4, 8)
          const inner = createHash('md5').update(password + user).digest('hex')
          const outer = createHash('md5').update(Buffer.concat([Buffer.from(inner), salt])).digest('hex')
          this.send('p', Buffer.from(`md5${outer}\0`))
        } else if (kind === 10) {
          const nonce = randomBytes(18).toString('base64')
          const first = `n=*,r=${nonce}`
          scram = { nonce, first }
          const mech = Buffer.from('SCRAM-SHA-256\0')
          const msg = Buffer.from(`n,,${first}`)
          const len = Buffer.alloc(4)
          len.writeInt32BE(msg.length)
          this.send('p', Buffer.concat([mech, len, msg]))
        } else if (kind === 11 && scram) {
          const server = m.body.subarray(4).toString()
          const attrs = Object.fromEntries(server.split(',').map((p) => [p[0], p.slice(2)]))
          const salted = pbkdf2Sync(password, Buffer.from(attrs.s, 'base64'), Number(attrs.i), 32, 'sha256')
          const clientKey = createHmac('sha256', salted).update('Client Key').digest()
          const storedKey = createHash('sha256').update(clientKey).digest()
          const finalNoProof = `c=biws,r=${attrs.r}`
          const authMsg = `${scram.first},${server},${finalNoProof}`
          const sig = createHmac('sha256', storedKey).update(authMsg).digest()
          const proof = Buffer.from(clientKey.map((b, i) => b ^ sig[i]))
          this.send('p', Buffer.from(`${finalNoProof},p=${proof.toString('base64')}`))
        } else if (kind === 12) continue
        else throw new Error(`unsupported auth ${kind}`)
      }
      if (m.type === 'Z') return
    }
  }
  /** 执行一条（或多条）SQL，返回最后一个结果集 */
  async query(sql: string): Promise<Row[]> {
    this.send('Q', Buffer.from(`${sql}\0`, 'utf8'))
    let cols: { name: string; oid: number }[] = []
    let rows: Row[] = []
    let err: PgError | null = null
    for (;;) {
      const m = await this.readMsg()
      if (m.type === 'T') {
        const n = m.body.readInt16BE(0)
        cols = []
        rows = []
        let i = 2
        for (let c = 0; c < n; c++) {
          const end = m.body.indexOf(0, i)
          const name = m.body.subarray(i, end).toString('utf8')
          i = end + 1
          const oid = m.body.readInt32BE(i + 6)
          cols.push({ name, oid })
          i += 18
        }
      } else if (m.type === 'D') {
        const n = m.body.readInt16BE(0)
        let i = 2
        const row: Row = {}
        for (let c = 0; c < n; c++) {
          const len = m.body.readInt32BE(i)
          i += 4
          const raw = len === -1 ? null : m.body.subarray(i, i + len).toString('utf8')
          if (len > 0) i += len
          row[cols[c].name] = parseValue(cols[c].oid, raw)
        }
        rows.push(row)
      } else if (m.type === 'C') {
        if (!cols.length) rows = []
      } else if (m.type === 'E') {
        const f = Conn.fields(m.body)
        err = new PgError(f.M, f.C)
      } else if (m.type === 'Z') {
        if (err) throw err
        return rows
      }
    }
  }
  close() {
    this.send('X', Buffer.alloc(0))
    this.sock.end()
  }
}

async function open(url: string): Promise<Conn> {
  const u = new URL(url)
  const sock = connect({ host: u.hostname, port: Number(u.port || 5432) })
  await new Promise<void>((res, rej) => {
    sock.once('connect', () => res())
    sock.once('error', rej)
  })
  const c = new Conn(sock)
  await c.startup(decodeURIComponent(u.username), decodeURIComponent(u.password), u.pathname.slice(1))
  return c
}

export function createPgWireDb(url: string): Db & { exec(sql: string): Promise<void> } {
  return {
    async query<T extends Row = Row>(text: string, params: unknown[] = []) {
      const c = await open(url)
      try {
        return (await c.query(inlineParams(text, params))) as T[]
      } finally {
        c.close()
      }
    },
    async transaction(stmts: Stmt[]) {
      const c = await open(url)
      try {
        await c.query('BEGIN')
        const out: Row[][] = []
        try {
          for (const s of stmts) out.push(await c.query(inlineParams(s.text, s.params)))
          await c.query('COMMIT')
        } catch (e) {
          await c.query('ROLLBACK').catch(() => {})
          throw e
        }
        return out
      } finally {
        c.close()
      }
    },
    async exec(sql: string) {
      const c = await open(url)
      try {
        await c.query(sql)
      } finally {
        c.close()
      }
    },
  }
}
