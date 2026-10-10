import { linkProps } from '../router'
import { CloudHeader, StateCard } from './ui'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen">
      <CloudHeader />
      <main className="px-4">
        <StateCard title="页面不存在" desc="链接可能已失效，或者地址输入有误。">
          <a {...linkProps('/')} className="btn-ghost px-5 py-2.5 text-sm">
            体验示例旅行局
          </a>
          <a {...linkProps('/create')} className="btn-primary px-5 py-2.5 text-sm">
            创建旅行局
          </a>
        </StateCard>
      </main>
    </div>
  )
}
