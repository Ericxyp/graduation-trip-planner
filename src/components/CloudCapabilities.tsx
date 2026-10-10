import { ArrowRight, Calculator, History, KeyRound, LockKeyhole, ReceiptText, Smartphone, UserMinus } from 'lucide-react'
import { linkProps } from '../router'

const ITEMS = [
  { icon: Smartphone, title: '多设备加入', desc: '邀请链接加入，每人独立身份' },
  { icon: LockKeyhole, title: '私密偏好计算', desc: '预算与底线只在服务端参与匹配' },
  { icon: Calculator, title: '发起人权限', desc: '锁定方案、管理邀请由服务端校验' },
  { icon: UserMinus, title: '退出自动重算', desc: '人数、人均与任务负责人随之更新' },
  { icon: ReceiptText, title: '实际费用台账', desc: '三种分摊方式，给出最少转账' },
  { icon: KeyRound, title: '身份恢复', desc: '换设备用恢复码找回发起人' },
  { icon: History, title: '操作记录', desc: '谁做了什么一目了然，不含隐私' },
]

/** 演示首页的“真实协作能力”说明：只介绍云端旅行局能做什么，不把示例数据冒充为云端数据 */
export default function CloudCapabilities() {
  return (
    <section className="pt-14 sm:pt-20" aria-labelledby="cloud-cap-title">
      <div className="card overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_2fr] lg:gap-10">
          <div>
            <span className="section-eyebrow">真实协作能力</span>
            <h2 id="cloud-cap-title" className="mt-2 text-xl font-extrabold tracking-tight text-ink-900 sm:text-2xl">
              示例之外，真的可以一起用
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-500">上面的“2027届毕业旅行”是本机演示数据。创建真实旅行局后，以下能力由云端提供。</p>
            <a {...linkProps('/create')} className="btn-primary mt-5 px-5 py-2.5 text-sm">
              创建真实旅行局
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <ul className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-3">
            {ITEMS.map((it) => (
              <li key={it.title} className="flex items-start gap-3 rounded-2xl bg-cream-50 p-3.5 ring-1 ring-cream-200">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-coral-600 ring-1 ring-coral-100">
                  <it.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink-800">{it.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-ink-500">{it.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
