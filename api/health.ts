/** GET /api/health：明确返回数据库与密钥配置状态，未配置时返回 503，绝不伪装成功 */
import { readConfig } from '../server/config.js'
import { neonDb } from '../server/neonDb.js'
import { health } from '../server/router.js'

export function GET(): Promise<Response> {
  return health({ config: readConfig(), db: neonDb })
}
