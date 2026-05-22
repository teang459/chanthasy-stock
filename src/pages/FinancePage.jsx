import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { fmtCurrency, fmtDate, downloadCSV } from '../lib/utils'
import { userMessage } from '../lib/errors'
import Modal from '../components/Modal'
import Confirm from '../components/Confirm'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import Field from '../components/Field'
import { SkeletonStats, SkeletonTable } from '../components/Skeleton'
import * as I from '../components/Icons'

const RANGES = [
  { value: '7',   label: '7 วัน' },
  { value: '30',  label: '30 วัน' },
  { value: '90',  label: '90 วัน' },
  { value: '365', label: '1 ปี' },
  { value: 'all', label: 'ทั้งหมด' },
]

const CATEGORIES = {
  income: [
    { value: 'sale',     label: '💰 ขายสินค้า (ทั่วไป)' },
    { value: 'service',  label: '🛠 บริการ' },
    { value: 'other',    label: '📦 อื่นๆ' },
  ],
  expense: [
    { value: 'purchase', label: '🛒 ซื้อของ' },
    { value: 'rent',     label: '🏠 ค่าเช่า' },
    { value: 'salary',   label: '👤 เงินเดือน' },
    { value: 'utility',  label: '⚡ สาธารณูปโภค' },
    { value: 'transport',label: '🚚 ค่าขนส่ง' },
    { value: 'marketing',label: '📣 การตลาด' },
    { value: 'other',    label: '📋 อื่นๆ' },
  ],
}

const CAT_LABEL = Object.fromEntries(
  [...CATEGORIES.income, ...CATEGORIES.expense].map(c => [c.value, c.label])
)

const today = () => new Date().toISOString().slice(0, 10)

function daysAgoISO(days) {
  const d = new Date(); d.setDate(d.getDate() - days); d.setHours(0,0,0,0)
  return d.toISOString()
}

const EMPTY = { type: 'income', category: 'sale', title: '', amount: '', date: today(), note: '' }

export default function FinancePage() {
  const { ownerId, profile } = useAuth()
  const { toast } = useToast()
  const { symbol } = useCurrency()
  const canWrite  = !profile?.manager_id || ['admin', 'staff'].includes(profile?.role)
  const canDelete = !profile?.manager_id || profile?.role === 'admin'

  const [entries, setEntries]   = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading]   = useState(true)
  const [range, setRange]       = useState('30')
  const [tab, setTab]           = useState('all') // all | income | expense
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [delItem, setDelItem]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [errors, setErrors]     = useState({})
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    if (!ownerId) return
    load()
    const ch = supabase.channel(`finance-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_entries', filter: `owner_id=eq.${ownerId}` }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [ownerId, range])

  async function load() {
    if (!ownerId) return
    setLoading(true)
    try {
      const eq = supabase.from('finance_entries').select('*').eq('owner_id', ownerId).order('date', { ascending: false }).limit(500)
      const mq = supabase.from('movements')
        .select('type, qty, created_at, plants(name, price, cost)')
        .eq('owner_id', ownerId)
        .in('type', ['in', 'out'])
        .order('created_at', { ascending: false })
        .limit(2000)
      if (range !== 'all') {
        const since = daysAgoISO(Number(range))
        eq.gte('date', since.slice(0, 10))
        mq.gte('created_at', since)
      }
      const [{ data: e, error: eErr }, { data: m, error: mErr }] = await Promise.all([eq, mq])
      if (eErr || mErr) throw (eErr || mErr)
      setEntries(e ?? [])
      setMovements(m ?? [])
    } catch (err) {
      toast.error(`โหลดไม่สำเร็จ: ${userMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }

  // Auto-derived from stock movements
  const stockSummary = useMemo(() => {
    let revenue = 0, cogs = 0, purchase = 0
    movements.forEach(m => {
      const qty = Math.abs(Number(m.qty) || 0)
      const price = Number(m.plants?.price ?? 0)
      const cost  = Number(m.plants?.cost ?? 0)
      if (m.type === 'out') { revenue += qty * price; cogs += qty * cost }
      else if (m.type === 'in') { purchase += qty * cost }
    })
    return { revenue, cogs, purchase, grossProfit: revenue - cogs }
  }, [movements])

  const manualSummary = useMemo(() => {
    let income = 0, expense = 0
    entries.forEach(e => {
      const amt = Number(e.amount) || 0
      if (e.type === 'income')  income  += amt
      else                      expense += amt
    })
    return { income, expense }
  }, [entries])

  const totals = useMemo(() => {
    const totalIncome  = stockSummary.revenue  + manualSummary.income
    const totalExpense = stockSummary.purchase + manualSummary.expense
    const netProfit    = totalIncome - totalExpense
    const margin       = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0
    return { totalIncome, totalExpense, netProfit, margin }
  }, [stockSummary, manualSummary])

  const filtered = useMemo(() => {
    if (tab === 'all') return entries
    return entries.filter(e => e.type === tab)
  }, [entries, tab])

  function validate(f) {
    const e = {}
    if (!f.title?.trim()) e.title = 'กรุณาระบุชื่อรายการ'
    const amt = Number(f.amount)
    if (!f.amount || isNaN(amt) || amt <= 0) e.amount = 'จำนวนเงินต้องมากกว่า 0'
    if (!f.date) e.date = 'กรุณาระบุวันที่'
    return e
  }

  function openAdd(type = 'income') {
    setForm({ ...EMPTY, type, category: CATEGORIES[type][0].value })
    setErrors({}); setEditItem(null); setShowForm(true)
  }

  function openEdit(item) {
    setForm({
      type: item.type,
      category: item.category,
      title: item.title,
      amount: String(item.amount),
      date: item.date,
      note: item.note ?? '',
    })
    setErrors({}); setEditItem(item); setShowForm(true)
  }

  function setF(k, v) {
    setForm(f => {
      // Reset category when switching type
      if (k === 'type' && v !== f.type) {
        return { ...f, type: v, category: CATEGORIES[v][0].value }
      }
      return { ...f, [k]: v }
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const payload = {
        type: form.type,
        category: form.category,
        title: form.title.trim(),
        amount: Number(form.amount),
        date: form.date,
        note: form.note?.trim() || null,
      }
      if (editItem) {
        const { error } = await supabase.from('finance_entries').update(payload).eq('id', editItem.id)
        if (error) throw error
        toast.success('แก้ไขรายการสำเร็จ')
      } else {
        const { error } = await supabase.from('finance_entries').insert({ ...payload, owner_id: ownerId })
        if (error) throw error
        toast.success(form.type === 'income' ? 'บันทึกรายรับสำเร็จ' : 'บันทึกรายจ่ายสำเร็จ')
      }
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(userMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item) {
    try {
      const { error } = await supabase.from('finance_entries').delete().eq('id', item.id)
      if (error) throw error
      toast.success('ลบรายการสำเร็จ')
      load()
    } catch (err) {
      toast.error(userMessage(err))
    }
    setDelItem(null)
  }

  function handleExport() {
    const rows = [
      ['วันที่', 'ประเภท', 'หมวดหมู่', 'รายการ', 'จำนวนเงิน', 'หมายเหตุ'],
      ...filtered.map(e => [
        fmtDate(e.date),
        e.type === 'income' ? 'รายรับ' : 'รายจ่าย',
        CAT_LABEL[e.category] || e.category,
        e.title,
        e.amount,
        e.note ?? '',
      ]),
    ]
    downloadCSV(rows, `การเงิน-${today()}.csv`)
    toast.success('ส่งออกสำเร็จ')
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><div><h1 className="page-title">การเงิน</h1><p className="page-sub">กำลังโหลด...</p></div></div>
        <SkeletonStats count={4} />
        <div style={{ marginTop: 24 }}><SkeletonTable rows={6} cols={5} /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">การเงิน</h1>
          <p className="page-sub">รายรับ {entries.filter(e=>e.type==='income').length} · รายจ่าย {entries.filter(e=>e.type==='expense').length} รายการ</p>
        </div>
        <div className="page-actions" style={{ alignItems: 'center', gap: 8 }}>
          <select value={range} onChange={e => setRange(e.target.value)} style={{ minWidth: 110 }}>
            {RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={handleExport}><I.Download size={13} /> ส่งออก</button>
          {canWrite && <button className="btn btn-primary" onClick={() => openAdd('income')}><I.Plus size={13} /> เพิ่มรายการ</button>}
        </div>
      </div>

      {/* P&L Summary */}
      <div className="stats-grid">
        <FinanceStat label="รายรับรวม"  value={fmtCurrency(totals.totalIncome)}  unit={symbol} color={140} icon={I.TrendUp} />
        <FinanceStat label="รายจ่ายรวม" value={fmtCurrency(totals.totalExpense)} unit={symbol} color={25}  icon={I.TrendDown} />
        <FinanceStat label="กำไรสุทธิ"  value={fmtCurrency(totals.netProfit)}    unit={symbol} color={totals.netProfit >= 0 ? 170 : 25} icon={I.Wallet} highlight={totals.netProfit >= 0 ? 'good' : 'bad'} />
        <FinanceStat label="อัตรากำไร"  value={`${totals.margin.toFixed(1)}%`}   unit=""       color={220} icon={I.Chart} />
      </div>

      {/* Breakdown */}
      <div className="finance-breakdown" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <BreakdownCard title="ที่มาของรายรับ" color={140}>
          <BreakdownRow label="ขายสต็อก (auto)"  value={stockSummary.revenue} symbol={symbol} />
          <BreakdownRow label="รายรับที่บันทึก"  value={manualSummary.income} symbol={symbol} />
        </BreakdownCard>
        <BreakdownCard title="ที่มาของรายจ่าย" color={25}>
          <BreakdownRow label="ซื้อสต็อก (auto)"  value={stockSummary.purchase} symbol={symbol} />
          <BreakdownRow label="รายจ่ายที่บันทึก"  value={manualSummary.expense} symbol={symbol} />
        </BreakdownCard>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginTop: 24, borderBottom: '1px solid var(--border)' }}>
        {[
          { v: 'all',     l: 'ทั้งหมด' },
          { v: 'income',  l: 'รายรับ' },
          { v: 'expense', l: 'รายจ่าย' },
        ].map(t => (
          <button key={t.v}
            onClick={() => setTab(t.v)}
            className="finance-tab"
            data-active={tab === t.v}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* Entries list */}
      {filtered.length === 0 ? (
        <EmptyState
          title="ยังไม่มีรายการ"
          desc={tab === 'income' ? 'เริ่มบันทึกรายรับที่ไม่ได้มาจากสต็อก' : tab === 'expense' ? 'เริ่มบันทึกค่าใช้จ่าย (ค่าเช่า เงินเดือน ฯลฯ)' : 'เริ่มบันทึกรายรับ-รายจ่ายของร้าน'}
          action={canWrite ? { label: 'เพิ่มรายการ', onClick: () => openAdd(tab === 'expense' ? 'expense' : 'income') } : undefined}
        />
      ) : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead><tr>
              <th>วันที่</th>
              <th>รายการ</th>
              <th>หมวดหมู่</th>
              <th style={{ textAlign: 'right' }}>จำนวน</th>
              <th style={{ width: 90 }}></th>
            </tr></thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id}>
                  <td className="text-sm mono">{fmtDate(e.date)}</td>
                  <td>
                    <div className="plant-name">{e.title}</div>
                    {e.note && <div className="plant-sci" style={{ fontStyle: 'normal' }}>{e.note}</div>}
                  </td>
                  <td><span className="badge">{CAT_LABEL[e.category] || e.category}</span></td>
                  <td className="mono" style={{ textAlign: 'right', color: e.type === 'income' ? 'var(--accent-ink)' : 'var(--danger-ink)', fontWeight: 600 }}>
                    {e.type === 'income' ? '+' : '−'}{fmtCurrency(e.amount)} {symbol}
                  </td>
                  <td>
                    <div className="row-actions">
                      {canWrite && <button className="icon-btn" onClick={() => openEdit(e)} title="แก้ไข"><I.Edit size={13} /></button>}
                      {canDelete && <button className="icon-btn danger" onClick={() => setDelItem(e)} title="ลบ"><I.Trash size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <Modal title={editItem ? 'แก้ไขรายการ' : 'เพิ่มรายการ'} onClose={() => setShowForm(false)} size="md">
          <form onSubmit={handleSave} className="form-grid">
            <Field label="ประเภท" required fullWidth>
              <div className="radio-group">
                {[['income', '📈 รายรับ'], ['expense', '📉 รายจ่าย']].map(([v, l]) => (
                  <label key={v} className={`radio-label ${form.type === v ? 'active' : ''}`}>
                    <input type="radio" value={v} checked={form.type === v} onChange={() => setF('type', v)} />
                    {l}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="หมวดหมู่" required>
              <select value={form.category} onChange={e => setF('category', e.target.value)}>
                {CATEGORIES[form.type].map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="วันที่" required error={errors.date}>
              <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} />
            </Field>
            <Field label="รายการ" required error={errors.title} fullWidth>
              <input value={form.title} onChange={e => setF('title', e.target.value)} placeholder={form.type === 'income' ? 'เช่น ขายต้นไม้หน้าร้าน' : 'เช่น ค่าเช่าเดือนพฤษภาคม'} autoFocus />
            </Field>
            <Field label={`จำนวนเงิน (${symbol})`} required error={errors.amount}>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setF('amount', e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="หมายเหตุ" fullWidth>
              <textarea rows={2} value={form.note} onChange={e => setF('note', e.target.value)} placeholder="รายละเอียดเพิ่มเติม..." />
            </Field>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Spinner size={14} color="#fff" /> : editItem ? 'บันทึก' : 'เพิ่มรายการ'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {delItem && (
        <Confirm title="ลบรายการ" danger
          desc={`ลบ "${delItem.title}" (${fmtCurrency(delItem.amount)} ${symbol})?`}
          confirmLabel="ลบ" onConfirm={() => handleDelete(delItem)} onCancel={() => setDelItem(null)}
        />
      )}
    </div>
  )
}

function FinanceStat({ label, value, unit, color, icon: Icon, highlight }) {
  return (
    <div className={`stat ${highlight === 'bad' ? 'stat--alert' : ''}`} style={highlight === 'good' ? { borderColor: 'oklch(75% 0.15 170)' } : undefined}>
      <div className="stat-label">
        {Icon && <span style={{ color: `oklch(50% 0.12 ${color})` }}><Icon size={14} /></span>}
        <span>{label}</span>
      </div>
      <div className="stat-value">
        <span style={{ color: `oklch(45% 0.12 ${color})` }}>{value}</span>
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
    </div>
  )
}

function BreakdownCard({ title, color, children }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>
        <span style={{ color: `oklch(45% 0.12 ${color})` }}>●</span> {title}
      </div>
      {children}
    </div>
  )
}

function BreakdownRow({ label, value, symbol }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="mono">{fmtCurrency(value)} {symbol}</span>
    </div>
  )
}
