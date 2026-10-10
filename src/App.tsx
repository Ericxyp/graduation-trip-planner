import { useEffect, useMemo, useRef, useState } from 'react'
import { SCHEMES, schemeById } from './data'
import { computeStats } from './logic'
import { useAppState } from './store'
import type { MyPrefs, SchemeId } from './types'
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

export default function App() {
  const { state, update, reset, storageOk, restored, corrupted } = useAppState()
  const toast = useToast()
  const [prefOpen, setPrefOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    if (corrupted) toast({ kind: 'error', title: '本地记录读取失败', desc: '已为你恢复到旅行局的初始状态' })
    else if (restored) toast({ kind: 'info', title: '已恢复上次的进度' })
  }, [corrupted, restored, toast])

  useEffect(() => {
    if (!storageOk) toast({ kind: 'error', title: '当前浏览器无法保存进度', desc: '可能处于无痕模式，刷新后改动会丢失' })
  }, [storageOk, toast])

  const allStats = useMemo(() => {
    const out = {} as Record<SchemeId, ReturnType<typeof computeStats>>
    SCHEMES.forEach((s) => (out[s.id] = computeStats(s, state.myPrefs)))
    return out
  }, [state.myPrefs])

  const activeId: SchemeId = state.locked ?? state.selected
  const active = schemeById(activeId)
  const activeStats = allStats[activeId]

  const taskKeys = active.itinerary.flatMap((d, di) => d.items.map((_, ii) => `${active.id}-${di}-${ii}`))
  const tasksDone = taskKeys.filter((k) => state.tasks[k]).length

  const exited = state.exited[activeId] ?? []
  const settleMembers = activeStats.participants.filter((id) => !exited.includes(id))
  const paidList = (state.paid[activeId] ?? []).filter((id) => settleMembers.includes(id))

  const filledCount = state.myPrefs ? 8 : 7

  const submitPrefs = (p: MyPrefs) => {
    const first = !state.myPrefs
    update((s) => ({ ...s, myPrefs: p }))
    setPrefOpen(false)
    const st = computeStats(schemeById(state.selected), p)
    toast({
      kind: 'success',
      title: first ? '偏好已提交，8/8 位成员已填写' : '偏好已更新',
      desc: `共识方案已重新计算：${schemeById(state.selected).city}方案 ${st.count}/8 人可参加，匹配度 ${st.match}%`,
    })
  }

  const lockScheme = (id: SchemeId) => {
    update((s) => ({ ...s, locked: id, selected: id }))
    toast({ kind: 'success', title: `已锁定「${schemeById(id).city}」方案`, desc: '行程与费用已同步生成，已通知全体成员' })
  }
  const unlock = () => {
    update((s) => ({ ...s, locked: null }))
    toast({ kind: 'info', title: '已取消锁定，可重新比较方案' })
  }

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <Header onInvite={() => setInviteOpen(true)} onReset={() => setResetOpen(true)} />
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
          onFill={() => setPrefOpen(true)}
          onInvite={() => setInviteOpen(true)}
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
          onFill={() => setPrefOpen(true)}
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
            update((s) => ({
              ...s,
              exited: { ...s.exited, [activeId]: isOut ? exited.filter((x) => x !== id) : [...exited, id] },
            }))
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
        <Footer onReset={() => setResetOpen(true)} />
      </main>

      <BottomBar
        hasMine={!!state.myPrefs}
        locked={!!state.locked}
        selectedCity={schemeById(state.selected).city}
        onFill={() => setPrefOpen(true)}
        onLock={() => lockScheme(state.selected)}
        onSettle={() => scrollTo('settle')}
        onInvite={() => setInviteOpen(true)}
      />

      <PreferenceSheet open={prefOpen} initial={state.myPrefs} onClose={() => setPrefOpen(false)} onSubmit={submitPrefs} />
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} filledCount={filledCount} />
      <ConfirmDialog
        open={resetOpen}
        title="重置演示数据？"
        desc="你的偏好、方案选择、任务状态与付款记录将恢复为初始状态，此操作无法撤销。"
        confirmText="确认重置"
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          reset()
          setResetOpen(false)
          window.scrollTo({ top: 0, behavior: 'smooth' })
          toast({ kind: 'success', title: '已重置为初始状态', desc: '7/8 位成员已填写偏好' })
        }}
      />
    </div>
  )
}
