/** 把迁移文件拆成单条语句（迁移文件约定：不含函数体，语句以“;+换行”结尾） */
export function splitSql(sql: string): string[] {
  return sql
    .split(/\n/)
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean)
}
