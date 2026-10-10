import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Pencil, Plus, ReceiptText, Trash2, X } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import { categoryLabel, EXPENSE_CATEGORIES, formatCents, parseYuanToCents, splitEqual } from '../shared/ledger'
import type { ExpenseView, LedgerView, MemberSummary } from '../shared/types'
import type { ExpenseInput } from './api'
import { MemberDot, inputCls } from './ui'

const SPLIT_LABEL = { equal_all: '参加成员均摊', equal_selected: '部分成员均摊', custom: '自定义金额' } as const

export function LedgerSection(p: {
  ledger: LedgerView
  members: MemberSummary[]
  participants: string[]
  meId: string
  locked: boolean
  readOnly: boolean
  busy: boolean
  onSave: (input: ExpenseInput, editing: ExpenseView | null) => Promise<boolean>
  onDelete: (e: ExpenseView) => void
}) {
  const [editing, setEditing] = useState<ExpenseView | null | 'new'>(null)
  const [deleting, setDeleting] = useState<ExpenseView | null>(null)
  const L = p.ledger
  const mine = L.balances.find((b) => b.memberId === p.meId)
  const color = (id: string) => p.members.find((m) => m.id === id)?.color ?? '#A3A8B8'
  const canAdd = p.locked && !p.readOnly

  return (
    <section id="ledger" className="pt-12 sm:pt-16" aria-labelledby="ledger-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="section-eyebrow">
            <ReceiptText className="h-3.5 w-3.5" />
            Actual expenses
          </span>
          <h2 id="ledger-title" className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-[28px]">
            实际费用台账
          </h2>
          <p className="mt-2 text-sm text-ink-500">记录真实花销，自动算出谁该给谁多少钱。仅用于记账，不会发起任何真实支付。</p>
        </div>
        <button onClick={() => setEditing('new')} disabled={!canAdd} title={p.locked ? '' : '发起人锁定方案后才能记账'} className="btn-primary px-5 py-2.5 text-sm">
          <Plus className="h-4 w-4" />
          记一笔
        </button>
      </div>

      {!p.locked && L.expenses.length === 0 ? (
        <div className="card mt-6 p-8 text-center">
          <p className="text-base font-bold text-ink-900">锁定方案后开始记账</p>
          <p className="mt-2 text-sm text-ink-500">发起人锁定团队方案后，所有成员都可以录入车票、住宿、聚餐等实际费用。</p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {[
              { label: '实际总支出', value: formatCents(L.totalCents), sub: `${L.expenses.length} 笔费用` },
              { label: '我已垫付', value: formatCents(mine?.paidCents ?? 0), sub: '我替大家付的钱' },
              { label: '我应承担', value: formatCents(mine?.owedCents ?? 0), sub: '按分摊方式计算' },
              {
                label: (mine?.netCents ?? 0) >= 0 ? '我应收' : '我应补',
                value: formatCents(Math.abs(mine?.netCents ?? 0)),
                sub: (mine?.netCents ?? 0) === 0 ? '已经两清' : (mine?.netCents ?? 0) > 0 ? '其他人需要转给我' : '我需要转给其他人',
                tone: (mine?.netCents ?? 0) > 0 ? 'text-emerald-700' : (mine?.netCents ?? 0) < 0 ? 'text-coral-600' : 'text-ink-900',
              },
            ].map((k) => (
              <div key={k.label} className="card p-4 sm:p-5">
                <p className="text-xs text-ink-500">{k.label}</p>
                <p className={`num mt-2 text-[22px] font-black tracking-tight sm:text-[26px] ${k.tone ?? 'text-ink-900'}`}>{k.value}</p>
                <p className="mt-1 text-xs text-ink-400">{k.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="card p-5 sm:p-6">
              <h3 className="text-base font-bold text-ink-900">费用明细</h3>
              {L.expenses.length === 0 ? (
                <p className="mt-4 rounded-2xl bg-cream-50 p-4 text-sm text-ink-500 ring-1 ring-cream-200">还没有费用。先把车票或民宿定金记上，系统会自动算出每人应付多少。</p>
              ) : (
                <ul className="mt-3 divide-y divide-dashed divide-cream-300">
                  {L.expenses.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 py-3">
                      <span className="mt-0.5 shrink-0 rounded-lg bg-cream-100 px-2 py-1 text-[11px] font-semibold text-ink-600">{categoryLabel(e.category)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-800">{e.title}</p>
                        <p className="mt-0.5 text-xs leading-5 text-ink-400">
                          {e.paidBy.displayName}
                          {e.paidBy.left && '（已退出）'}垫付 · {SPLIT_LABEL[e.splitMethod]} · {e.shares.length}人分摊
                        </p>
                      </div>
                      <span className="num shrink-0 text-sm font-bold text-ink-900">{formatCents(e.amountCents)}</span>
                      {e.canEdit && !p.readOnly && (
                        <span className="flex shrink-0 gap-0.5">
                          <button onClick={() => setEditing(e)} aria-label={`修改费用 ${e.title}`} className="rounded-lg p-1.5 text-ink-400 hover:bg-cream-100 hover:text-ink-700">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDeleting(e)} aria-label={`删除费用 ${e.title}`} className="rounded-lg p-1.5 text-ink-400 hover:bg-coral-50 hover:text-coral-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className="card p-5 sm:p-6">
                <h3 className="text-base font-bold text-ink-900">最少转账建议</h3>
                <p className="mt-1 text-xs text-ink-400">按“应补最多的人先转给应收最多的人”计算，笔数最少不超过人数减一</p>
                {L.transfers.length === 0 ? (
                  <p className="mt-4 text-sm text-ink-500">{L.expenses.length ? '大家已经两清，不需要转账。' : '记账后这里会显示转账建议。'}</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {L.transfers.map((t) => (
                      <li key={`${t.from}-${t.to}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream-50 px-3 py-2.5 text-sm ring-1 ring-cream-200">
                        <span className={`font-semibold ${t.from === p.meId ? 'text-coral-600' : 'text-ink-800'}`}>{t.from === p.meId ? '我' : t.fromName}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-ink-400" />
                        <span className={`font-semibold ${t.to === p.meId ? 'text-emerald-700' : 'text-ink-800'}`}>{t.to === p.meId ? '我' : t.toName}</span>
                        <span className="num ml-auto font-bold text-ink-900">{formatCents(t.cents, { alwaysDecimals: true })}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="card p-5 sm:p-6">
                <h3 className="text-base font-bold text-ink-900">每人收支</h3>
                <ul className="mt-3 space-y-1.5">
                  {L.balances.map((b) => (
                    <li key={b.memberId} className="flex items-center gap-2.5 text-sm">
                      <MemberDot name={b.displayName} color={color(b.memberId)} size="sm" dim={b.left} />
                      <span className="min-w-0 flex-1 truncate font-medium text-ink-700">
                        {b.displayName}
                        {b.left && <span className="ml-1 text-xs text-ink-400">已退出</span>}
                      </span>
                      <span className="num hidden text-xs text-ink-400 min-[400px]:inline">
                        垫{formatCents(b.paidCents)} · 摊{formatCents(b.owedCents)}
                      </span>
                      <span className={`num w-20 text-right text-sm font-bold ${b.netCents > 0 ? 'text-emerald-700' : b.netCents < 0 ? 'text-coral-600' : 'text-ink-400'}`}>
                        {b.netCents === 0 ? '两清' : formatCents(b.netCents, { sign: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      <ExpenseDialog
        open={editing !== null}
        editing={editing === 'new' ? null : editing}
        members={p.members}
        participants={p.participants}
        meId={p.meId}
        busy={p.busy}
        onClose={() => setEditing(null)}
        onSave={async (input) => {
          const ok = await p.onSave(input, editing === 'new' ? null : editing)
          if (ok) setEditing(null)
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={`删除费用「${deleting?.title ?? ''}」？`}
        desc="删除后这笔费用不再计入总额和每人收支，转账建议会自动重算。记录会保留在后台，便于追溯。"
        confirmText="确认删除"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) p.onDelete(deleting)
          setDeleting(null)
        }}
      />
    </section>
  )
}

function ExpenseDialog(p: {
  open: boolean
  editing: ExpenseView | null
  members: MemberSummary[]
  participants: string[]
  meId: string
  busy: boolean
  onClose: () => void
  onSave: (input: ExpenseInput) => void
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('food')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(p.meId)
  const [method, setMethod] = useState<ExpenseInput['split']['splitMethod']>('equal_all')
  const [selected, setSelected] = useState<string[]>([])
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (!p.open) return
    const e = p.editing
    setTitle(e?.title ?? '')
    setCategory(e?.category ?? 'food')
    setAmount(e ? (e.amountCents / 100).toFixed(2).replace(/\.00$/, '') : '')
    setPaidBy(e && p.members.some((m) => m.id === e.paidBy.id) ? e.paidBy.id : p.meId)
    setMethod(e?.splitMethod ?? 'equal_all')
    setSelected(e ? e.shares.map((s) => s.memberId) : p.members.map((m) => m.id))
    setCustom(e ? Object.fromEntries(e.shares.map((s) => [s.memberId, (s.shareCents / 100).toFixed(2).replace(/\.00$/, '')])) : {})
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open, p.editing])

  const cents = parseYuanToCents(amount)
  const customSum = useMemo(() => Object.values(custom).reduce((s, v) => s + (parseYuanToCents(v || '0') ?? NaN), 0), [custom])
  const preview = useMemo(() => {
    if (!cents) return null
    try {
      if (method === 'equal_all') {
        const ids = p.participants.length ? p.participants : p.members.map((m) => m.id)
        return splitEqual(cents, ids)
      }
      if (method === 'equal_selected' && selected.length) return splitEqual(cents, p.members.map((m) => m.id).filter((id) => selected.includes(id)))
    } catch {
      return null
    }
    return null
  }, [cents, method, selected, p.participants, p.members])

  const submit = () => {
    setError('')
    if (!title.trim()) return setError('请填写费用名称')
    if (!cents) return setError('金额格式不正确，例如 186.50')
    let split: ExpenseInput['split']
    if (method === 'equal_all') split = { splitMethod: 'equal_all' }
    else if (method === 'equal_selected') {
      if (!selected.length) return setError('请至少选择一位分摊成员')
      split = { splitMethod: 'equal_selected', memberIds: selected }
    } else {
      const shares = Object.entries(custom)
        .map(([memberId, v]) => ({ memberId, shareCents: parseYuanToCents(v || '0') }))
        .filter((s) => s.shareCents !== 0)
      if (shares.some((s) => s.shareCents === null)) return setError('自定义金额格式不正确')
      const sum = shares.reduce((s, x) => s + (x.shareCents ?? 0), 0)
      if (sum !== cents) return setError(`分摊合计 ${formatCents(sum, { alwaysDecimals: true })}，需等于总额 ${formatCents(cents, { alwaysDecimals: true })}`)
      split = { splitMethod: 'custom', shares: shares as { memberId: string; shareCents: number }[] }
    }
    p.onSave({ title: title.trim(), category, amountCents: cents, paidBy, split })
  }

  return (
    <Modal open={p.open} onClose={p.onClose} labelledBy="expense-title">
      <div className="rounded-t-[28px] bg-white shadow-lift sm:rounded-[28px]">
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 id="expense-title" className="text-lg font-extrabold text-ink-900">
            {p.editing ? '修改费用' : '记一笔费用'}
          </h2>
          <button onClick={p.onClose} aria-label="关闭" className="-mr-2 rounded-full p-2 text-ink-400 hover:bg-cream-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold text-ink-500">名称</span>
              <input data-autofocus className={inputCls} value={title} maxLength={40} placeholder="例如：毕业晚宴" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block w-24 min-[360px]:w-28">
              <span className="mb-1.5 block text-xs font-semibold text-ink-500">金额（元）</span>
              <input className={`${inputCls} num`} inputMode="decimal" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} />
            </label>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-ink-500">类别</span>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map((c) => (
                <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)} className={`rounded-xl px-3 py-1.5 text-sm font-medium ${category === c.id ? 'bg-ink-800 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-800/10'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-500">谁垫付的</span>
            <select className={inputCls} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {p.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === p.meId ? `${m.displayName}（我）` : m.displayName}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-ink-500">怎么分摊</span>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SPLIT_LABEL) as (keyof typeof SPLIT_LABEL)[]).map((k) => (
                <button key={k} type="button" aria-pressed={method === k} onClick={() => setMethod(k)} className={`rounded-xl px-2 py-2 text-xs font-semibold sm:text-sm ${method === k ? 'bg-coral-500 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-800/10'}`}>
                  {SPLIT_LABEL[k]}
                </button>
              ))}
            </div>
            <ul className="mt-3 space-y-1.5">
              {p.members.map((m) => {
                const inPlan = method === 'equal_all' ? (p.participants.length ? p.participants.includes(m.id) : true) : method === 'equal_selected' ? selected.includes(m.id) : true
                return (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    {method === 'equal_selected' ? (
                      <input
                        type="checkbox"
                        id={`sel-${m.id}`}
                        checked={selected.includes(m.id)}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id)))}
                        className="h-4 w-4 accent-coral-500"
                      />
                    ) : null}
                    <label htmlFor={`sel-${m.id}`} className={`min-w-0 flex-1 truncate ${inPlan ? 'text-ink-700' : 'text-ink-300'}`}>
                      {m.displayName}
                    </label>
                    {method === 'custom' ? (
                      <input
                        aria-label={`${m.displayName} 承担金额`}
                        className="num w-24 rounded-lg bg-white px-2 py-1.5 text-right text-sm ring-1 ring-ink-800/10 outline-none focus:ring-2 focus:ring-sky-400"
                        inputMode="decimal"
                        placeholder="0"
                        value={custom[m.id] ?? ''}
                        onChange={(e) => setCustom((c) => ({ ...c, [m.id]: e.target.value }))}
                      />
                    ) : (
                      <span className="num text-xs text-ink-500">{preview?.get(m.id) !== undefined ? formatCents(preview.get(m.id)!, { alwaysDecimals: true }) : '—'}</span>
                    )}
                  </li>
                )
              })}
            </ul>
            {method === 'custom' && cents ? (
              <p className={`mt-2 text-xs ${customSum === cents ? 'text-emerald-700' : 'text-coral-600'}`}>
                已分配 {Number.isNaN(customSum) ? '—' : formatCents(customSum, { alwaysDecimals: true })} / {formatCents(cents, { alwaysDecimals: true })}
              </p>
            ) : null}
          </div>
          {error && (
            <p className="rounded-xl bg-coral-50 px-3 py-2 text-sm text-coral-700 ring-1 ring-coral-200" role="alert">
              {error}
            </p>
          )}
          <button onClick={submit} disabled={p.busy} className="btn-primary w-full py-3 text-[15px]">
            {p.busy ? '正在保存…' : p.editing ? '保存修改' : '记入台账'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
