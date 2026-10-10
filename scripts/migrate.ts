/**
 * 数据库迁移：按文件名顺序执行 db/migrations/*.sql，已执行的记录在 schema_migrations 中。
 * 用法：npm run db:migrate（读取环境变量或 .env.local 中的 DATABASE_URL）
 * 安全：先对 Preview/开发分支执行并验证，再对生产数据库执行；脚本会打印目标主机便于确认。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { splitSql } from '../server/sql.js'

function loadEnvFile(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

async function main() {
  loadEnvFile('.env.local')
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('缺少 DATABASE_URL：请在 .env.local 中配置，或通过 `vercel env pull .env.local` 拉取')
    process.exit(1)
  }
  const host = new URL(url).host
  console.log(`迁移目标：${host}`)
  const sql = neon(url)
  await sql.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
  const done = new Set(((await sql.query(`SELECT name FROM schema_migrations`)) as { name: string }[]).map((r) => r.name))
  // 默认执行 db/migrations/*.sql；--post-deploy 执行 db/migrations/post-deploy/*.sql（生产已切换到新代码后再跑）
  const postDeploy = process.argv.includes('--post-deploy')
  const dryRun = process.argv.includes('--dry-run')
  const sub = postDeploy ? 'post-deploy' : ''
  const dir = join(process.cwd(), 'db', 'migrations', sub)
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    const name = sub ? `${sub}/${f}` : f
    if (done.has(name)) {
      console.log(`· 跳过 ${name}（已执行）`)
      continue
    }
    const stmts = splitSql(readFileSync(join(dir, f), 'utf8'))
    if (dryRun) {
      console.log(`○ 待执行 ${name}（${stmts.length} 条语句）`)
      continue
    }
    // 每个文件在一个事务中执行；文件本身幂等，失败可安全重试
    await sql.transaction([...stmts.map((s) => sql.query(s)), sql.query(`INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`, [name])])
    console.log(`✓ 已执行 ${name}（${stmts.length} 条语句）`)
  }
  console.log(dryRun ? '预检完成（未写入）' : '迁移完成')
}

if (process.argv[1] && /migrate\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error('迁移失败：', (e as Error).message)
    process.exit(1)
  })
}
