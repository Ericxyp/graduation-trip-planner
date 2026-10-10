/**
 * 旅行局 API 的唯一入口（Vercel Function，Web 标准签名）。
 * vercel.json 把 /api/trips/* 重写到这里，并通过 ?__path= 传入原始路径。
 */
import { readConfig } from '../server/config.js'
import { neonDb } from '../server/neonDb.js'
import { handleApi } from '../server/router.js'

const handler = (request: Request): Promise<Response> => handleApi(request, { config: readConfig(), db: neonDb })

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
