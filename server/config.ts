/** 服务端配置：只从 process.env 读取，前端永远拿不到这些值 */
export interface ServerConfig {
  databaseUrl: string | null
  tokenPepper: string
  pepperConfigured: boolean
  appOrigin: string | null
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const databaseUrl = env.DATABASE_URL?.trim() || null
  const pepper = env.TOKEN_PEPPER?.trim() ?? ''
  return {
    databaseUrl,
    tokenPepper: pepper,
    pepperConfigured: pepper.length >= 16,
    appOrigin: env.APP_ORIGIN?.trim().replace(/\/$/, '') || null,
  }
}
