import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { memberById, schemeById } from './data'
import { buildDelta, computeAll, perPersonFor, yuan, type RecommendationDelta } from './logic'
import { hasSeenOnboarding, markOnboardingSeen } from './onboarding'
import { useAppState } from './store'
import type { MemberId, MyPrefs, SchemeId } from './types'
import { useToast } from './components/Toast'
import Header from './components/Header'
import Overview from './components/Overview'
import Consensus from './components/Consensus'
import Itinerary from './components/Itinerary'
import Settlement from './components/Settlement'
import PreferenceSheet from './components/PreferenceSheet'
import InviteDialog from './components/InviteDialog'
import ConfirmDialog from './components/ConfirmDialog'
import BottomBar from './components/BottomBar'
import Footer from './components/Footer'
import Onboarding from './components/Onboarding'
import ChangeFeedback from './components/ChangeFeedback'
import DemoPanel, { type DemoAction } from './components/DemoPanel'

/** 邀请参数在模块加载时读取一次，避免 StrictMode 双调用导致丢失 */
const INITIAL_JOIN = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('join') : null

/** 演示用推荐偏好：只在用户主动点击时预填，提交前不写入存储 */
const DEMO_PRESET: Partial<MyPrefs> = {
  dates: ['2027-06-20', '2027-06-21', '2027-06-22', '2027-06-23'],
  budget: 'b3',
  destinations: ['chengdu', 'qingdao', 'changsha'],
  pace: 'balanced',
  stay: 'homestay',
  musts: ['要有毕业合影/跟拍', '能吃到地道本地菜'],
  nos: ['红眼航班或夜车'],
}

/** 同一时刻只显示一个主要弹层 */
type Overlay = 'pref' | 'invite' | 'reset' | 'delta' | 'demo' | null

export default function App() {
  const { state, update, reset, storageOk, restored, corrupted } = useAppState()
  const toast = useToast()
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [delta, setDelta] = useState<RecommendationDelta | null>(null)
  const [preset, setPreset] = useState<Partial<MyPrefs> | null>(null)
  const [guideOpen, setGuideOpen] = useState(() => !hasSeenOnboarding())
  const booted = useRef(false)
  const timers = useRef<number[]>([])

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
  }, [])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    if (corrupted) toast({ kind: 'error', title: '本地记录读取失败', desc: '已为你恢复到旅行局的初始状态' })
    else if (restored) toast({ kind: 'info', title: '已恢复上次的进度' })
  }, [corrupted, restored, toast])

  useEffect(() => {
    if (!storageOk) toast({ kind: 'error', title: '当前浏览器无法保存进度', desc: '可能处于无痕模式，刷新后改动会丢失' })
  }, [storageOk, toast])

  // 邀请链接 ?join=GRAD27：自动打开偏好表单
  useEffect(() => {
    if (!INITIAL_JOIN) return
    if (window.location.search) window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
    const t = window.setTimeout(() => {
      if (INITIAL_JOIN === 'GRAD27') {
        setOverlay('pref')
        toast({ kind: 'info', title: '已加入「2027届毕业旅行」', desc: '填写你的真实偏好，系统会重新计算全员共识' })
      } else {
        toast({ kind: 'error', title: '邀请链接已失效', desc: '请向旅行局发起人获取新的邀请链接' })
      }
    }, 350)
    return () => window.clearTimeout(t)
  }, [toast])

  const allStats = useMemo(() => computeAll(state.myPrefs), [state.myPrefs])

  const activeId: SchemeId = state.locked ?? state.selected
  const active = schemeById(activeId)
  const activeStats = allStats[activeId]

  const taskKeys = active.itinerary.flatMap((d, di) => d.items.map((_, ii) => `${active.id}-${di}-${ii}`))
  const tasksDone = taskKeys.filter((k) => state.tasks[k]).length

  const exited = state.exited[activeId] ?? []
  const settleMembers = activeStats.participants.filter((id) => !exited.includes(id))
  const paidList = (state.paid[activeId] ?? []).filter((id) => settleMembers.includes(id))

  const filledCount = state.myPrefs ? 8 : 7

  const scrollTo = useCallback((id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), [])

  const openPref = () => setOverlay('pref')
  const closeOverlay = () => setOverlay(null)

  /* ---------- 偏好提交：真实计算前后变化 ---------- */
  const submitPrefs = (p: MyPrefs) => {
    const d = buildDelta(state.myPrefs, p, state.locked)
    // 已锁定时不改变团队锁定；未锁定时切到个人最佳方案
    update((s) => ({ ...s, myPrefs: p, selected: s.locked ?? d.afterSchemeId }))
    setDelta(d)
    setOverlay('delta')
    toast({ kind: 'success', title: d.isUpdate ? '偏好已更新' : '偏好已提交，8/8 位成员已填写' })
  }

  /* ---------- 方案锁定 ---------- */
  const lockScheme = (id: SchemeId) => {
    const prev = state.locked
    update((s) => ({ ...s, locked: id, selected: id }))
    toast(
      prev && prev !== id
        ? { kind: 'success', title: `已改为锁定「${schemeById(id).city}」方案`, desc: `原锁定的${schemeById(prev).city}方案已解除，行程与费用已同步` }
        : { kind: 'success', title: `已锁定「${schemeById(id).city}」方案`, desc: '行程与费用已同步生成，已通知全体成员' },
    )
  }
  const unlock = () => {
    update((s) => ({ ...s, locked: null }))
    toast({ kind: 'info', title: '已取消锁定，可重新比较方案' })
  }

  /* ---------- 成员退出 ---------- */
  const setExit = (schemeId: SchemeId, id: MemberId, out: boolean) => {
    update((s) => {
      const list = s.exited[schemeId] ?? []
      const next = out ? (list.includes(id) ? list : [...list, id]) : list.filter((x) => x !== id)
      return { ...s, exited: { ...s.exited, [schemeId]: next } }
    })
  }

  /* ---------- 演示快捷操作：复用上面的真实状态函数 ---------- */
  const runDemo = (a: DemoAction) => {
    setOverlay(null)
    if (a === 'prefill') {
      if (state.myPrefs) {
        toast({ kind: 'info', title: '已为你打开已保存的偏好', desc: '你已提交过真实偏好，不会被推荐偏好覆盖' })
      } else {
        setPreset(DEMO_PRESET)
      }
      setOverlay('pref')
      return
    }
    if (a === 'compare') {
      update((s) => ({ ...s, selected: 'consensus' }))
      later(() => scrollTo('consensus'), 40)
      toast({ kind: 'info', title: '点击上方三张方案卡，可以比较人数、预算与冲突。' })
      return
    }
    if (a === 'lock') {
      if (state.locked === 'consensus') toast({ kind: 'info', title: '成都方案已处于锁定状态' })
      else lockScheme('consensus')
      later(() => scrollTo('itinerary'), 40)
      return
    }
    if (a === 'exit') {
      const sid: SchemeId = 'consensus'
      if (state.locked && state.locked !== sid) lockScheme(sid)
      else if (!state.locked) update((s) => ({ ...s, selected: sid }))
      const st = allStats[sid]
      const list = state.exited[sid] ?? []
      const candidates = st.participants.filter((id) => id !== 'lin' && id !== 'me')
      const target = candidates.includes('zhe') ? 'zhe' : candidates.find((id) => !list.includes(id))
      later(() => scrollTo('settle'), 40)
      if (!target) return
      const name = memberById(target).name
      if (list.includes(target)) {
        toast({ kind: 'info', title: `${name}已处于退出状态`, desc: '可在AA明细中关闭“临时退出”恢复' })
        return
      }
      const n0 = st.participants.length
      const remaining = n0 - list.length - 1
      if (remaining < 2) {
        toast({ kind: 'error', title: '至少需要保留2位成员' })
        return
      }
      const scheme = schemeById(sid)
      const inc = perPersonFor(scheme.costs, remaining) - perPersonFor(scheme.costs, n0)
      setExit(sid, target, true)
      toast({ kind: 'info', title: `已模拟${name}临时退出`, desc: `成都方案人均较原方案增加 ${yuan(inc)}` })
      return
    }
    if (a === 'reset') setOverlay('reset')
  }

  const dismissGuide = () => {
    markOnboardingSeen()
    setGuideOpen(false)
  }

  return (
    <div className="min-h-screen overflow-x-clip pb-28 lg:pb-0">
      <Header onInvite={() => setOverlay('invite')} onReset={() => setOverlay('reset')} onDemo={() => setOverlay('demo')} />
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <Overview
          filledCount={filledCount}
          hasMine={!!state.myPrefs}
          locked={state.locked ? schemeById(state.locked) : null}
          selectedCity={schemeById(state.selected).city}
          tasksDone={tasksDone}
          tasksTotal={taskKeys.length}
          paidCount={paidList.length}
          settleCount={settleMembers.length}
          onFill={openPref}
          onInvite={() => setOverlay('invite')}
          onDemo={() => setOverlay('demo')}
          onJump={scrollTo}
        />
        <Consensus
          stats={allStats}
          selected={state.selected}
          locked={state.locked}
          hasMine={!!state.myPrefs}
          onSelect={(id) => update((s) => ({ ...s, selected: id }))}
          onLock={lockScheme}
          onUnlock={unlock}
          onFill={openPref}
        />
        <Itinerary
          scheme={active}
          stats={activeStats}
          isLocked={!!state.locked}
          tasks={state.tasks}
          onToggle={(key, label) => {
            const next = !state.tasks[key]
            update((s) => ({ ...s, tasks: { ...s.tasks, [key]: next } }))
            toast({ kind: next ? 'success' : 'info', title: next ? '已标记完成' : '已改为待办', desc: label })
          }}
          onGoConsensus={() => scrollTo('consensus')}
        />
        <Settlement
          scheme={active}
          stats={activeStats}
          exited={exited}
          paid={state.paid[activeId] ?? []}
          isLocked={!!state.locked}
          onToggleExit={(id, name) => {
            const isOut = exited.includes(id)
            setExit(activeId, id, !isOut)
            toast({ kind: 'info', title: isOut ? `${name} 已恢复参加` : `已模拟 ${name} 临时退出`, desc: '人均费用已重新计算' })
          }}
          onTogglePaid={(id, name) => {
            const list = state.paid[activeId] ?? []
            const isPaid = list.includes(id)
            update((s) => ({
              ...s,
              paid: { ...s.paid, [activeId]: isPaid ? list.filter((x) => x !== id) : [...list, id] },
            }))
            toast({ kind: isPaid ? 'info' : 'success', title: isPaid ? `已撤销 ${name} 的付款记录` : `已记录 ${name} 完成付款` })
          }}
          onRestoreAll={() => {
            update((s) => ({ ...s, exited: { ...s.exited, [activeId]: [] } }))
            toast({ kind: 'success', title: '已恢复全部成员' })
          }}
        />
        <Footer onReset={() => setOverlay('reset')} onDemo={() => setOverlay('demo')} />
      </main>

      <BottomBar
        hasMine={!!state.myPrefs}
        locked={!!state.locked}
        selectedCity={schemeById(state.selected).city}
        onFill={openPref}
        onLock={() => lockScheme(state.selected)}
        onSettle={() => scrollTo('settle')}
        onInvite={() => setOverlay('invite')}
      />

      {guideOpen && (
        <Onboarding
          suspended={overlay !== null}
          onDismiss={dismissGuide}
          onStart={() => {
            dismissGuide()
            if (!state.myPrefs) openPref()
            else scrollTo('consensus')
          }}
        />
      )}

      <PreferenceSheet
        open={overlay === 'pref'}
        initial={state.myPrefs}
        preset={preset}
        onPresetConsumed={() => setPreset(null)}
        onClose={closeOverlay}
        onSubmit={submitPrefs}
      />
      <InviteDialog open={overlay === 'invite'} onClose={closeOverlay} filledCount={filledCount} />
      <DemoPanel open={overlay === 'demo'} onClose={closeOverlay} onAction={runDemo} />
      <ChangeFeedback
        delta={overlay === 'delta' ? delta : null}
        onClose={closeOverlay}
        onViewBasis={() => {
          closeOverlay()
          later(() => scrollTo('consensus'), 60)
        }}
      />
      <ConfirmDialog
        open={overlay === 'reset'}
        title="重置演示数据？"
        desc="你的偏好、方案选择、任务状态与付款记录将恢复为初始状态，此操作无法撤销。"
        confirmText="确认重置"
        onCancel={closeOverlay}
        onConfirm={() => {
          reset()
          setOverlay(null)
          setDelta(null)
          window.scrollTo({ top: 0, behavior: 'smooth' })
          toast({ kind: 'success', title: '已重置为初始状态', desc: '7/8 位成员已填写偏好' })
        }}
      />
    </div>
  )
}
