import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { fmtCurrency, fmtDate, fmtDateTime, downloadCSV } from '../lib/utils'
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
    { value: 'sale',     label: '💰 ขายสินค้า (นอกระบบสต็อก)' },
    { value: 'service',  label: '🛠 บริการ' },
    { value: 'other',    label: '📦 อื่นๆ' },
  ],
  expense: [
    { value: 'purchase', label: '🛒 ซื้อของ (นอกระบบสต็อก)' },
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
  const { ownerId, perms } = useAuth()
  const { toast } = useToast()
  const { symbol } = useCurrency()
  const canWrite  = perms.perm_finance
  const canDelete = perms.perm_finance

  const [entries, setEntries]   = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')
  const [range, setRange]       = useState('30')
  const [tab, setTab]           = useState('all') // all | income | expense | stock | manual
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [delItem, setDelItem]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [errors, setErrors]     = useState({})
  const [saving, setSaving]     = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Data loading — separate from realtime subscription
  useEffect(() => {
    if (!ownerId) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setLoadError('')

    const timeout = setTimeout(() => {
      if (!cancelled) {
        setLoadError('โหลดข้อมูลช้าผิดปกติ — ตรวจสอบการเชื่อมต่อ')
        setLoading(false)
      }
    }, 15000)

    ;(async () => {
      try {
        const eq = supabase.from('finance_entries').select('*').eq('store_id', ownerId).order('date', { ascending: false }).limit(1000)
        const mq = supabase.from('movements')
          .select('id, type, qty, note, created_at, plants(id, name, sku, price, cost)')
          .eq('store_id', ownerId)
          .in('type', ['in', 'out', 'new'])
          .order('created_at', { ascending: false })
          .limit(2000)
        if (range !== 'all') {
          const since = daysAgoISO(Number(range))
          eq.gte('date', since.slice(0, 10))
          mq.gte('created_at', since)
        }
        const [eRes, mRes] = await Promise.all([eq, mq])
        if (cancelled) return
        if (eRes.error) throw eRes.error
        if (mRes.error) throw mRes.error
        setEntries(eRes.data ?? [])
        setMovements(mRes.data ?? [])
      } catch (err) {
        if (cancelled) return
        console.error('[Finance] load error:', err)
        setLoadError(userMessage(err) + ` (${err.code || err.message || 'unknown'})`)
      } finally {
        clearTimeout(timeout)
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true; clearTimeout(timeout) }
  }, [ownerId, range, reloadKey])

  // Realtime — separate so its failure doesn't block load
  useEffect(() => {
    if (!ownerId) return
    let ch
    try {
      ch = supabase.channel(`finance-${ownerId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_entries', filter: `store_id=eq.${ownerId}` }, () => {
          setReloadKey(k => k + 1)
        })
        .subscribe()
    } catch (err) {
      console.warn('[Finance] realtime failed (non-fatal):', err)
    }
    return () => { if (ch) supabase.removeChannel(ch) }
  }, [ownerId])

  // Build unified ledger: manual entries + stock movements as line items
  const ledger = useMemo(() => {
    const stockRows = movements
      .filter(m => {
        // Filter out entries with no financial impact
        const qty = Math.abs(Number(m.qty) || 0)
        if (qty === 0) return false
        if (m.type === 'out' && !m.plants?.price) return false
        if ((m.type === 'in' || m.type === 'new') && !m.plants?.cost) return false
        return true
      })
      .map(m => {
        const qty = Math.abs(Number(m.qty) || 0)
        const price = Number(m.plants?.price ?? 0)
        const cost  = Number(m.plants?.cost ?? 0)
        const isIncome = m.type === 'out'
        const unitAmount = isIncome ? price : cost
        const amount = qty * unitAmount
        const labels = {
          out: '📤 ขายจากสต็อก',
          in:  '📦 รับสต็อก',
          new: '🆕 เพิ่มสต็อกใหม่',
        }
        return {
          id: `mov-${m.id}`,
          source: 'stock',
          type: isIncome ? 'income' : 'expense',
          date: m.created_at.slice(0, 10),
          sortAt: new Date(m.created_at).getTime(),
          category: isIncome ? 'sale_stock' : (m.type === 'new' ? 'new_stock' : 'purchase_stock'),
          categoryLabel: labels[m.type] || '📦 สต็อก',
          title: m.plants?.name ?? '(สินค้าถูกลบ)',
          sku: m.plants?.sku,
          qty,
          unitAmount,
          amount,
          note: m.note,
        }
      })
    const manualRows = entries.map(e => ({
      id: `ent-${e.id}`,
      _id: e.id,
      source: 'manual',
      type: e.type,
      date: e.date,
      sortAt: new Date(e.date + 'T00:00:00').getTime(),
      category: e.category,
      categoryLabel: CAT_LABEL[e.category] || e.category,
      title: e.title,
      qty: 1,
      unitAmount: Number(e.amount),
      amount: Number(e.amount),
      note: e.note,
    }))
    return [...stockRows, ...manualRows].sort((a, b) => b.sortAt - a.sortAt)
  }, [movements, entries])

  const totals = useMemo(() => {
    let income = 0, expense = 0
    let stockIncome = 0, restockExpense = 0, newStockExpense = 0
    let manualIncome = 0, manualExpense = 0
    ledger.forEach(r => {
      if (r.type === 'income') {
        income += r.amount
        if (r.source === 'stock') stockIncome += r.amount; else manualIncome += r.amount
      } else {
        expense += r.amount
        if (r.source === 'stock') {
          if (r.category === 'new_stock') newStockExpense += r.amount
          else restockExpense += r.amount
        } else manualExpense += r.amount
      }
    })
    const profit = income - expense
    const margin = income > 0 ? (profit / income) * 100 : 0
    return { income, expense, profit, margin, stockIncome, restockExpense, newStockExpense, manualIncome, manualExpense }
  }, [ledger])

  const filtered = useMemo(() => {
    if (tab === 'all')     return ledger
    if (tab === 'income')  return ledger.filter(r => r.type === 'income')
    if (tab === 'expense') return ledger.filter(r => r.type === 'expense')
    if (tab === 'stock')   return ledger.filter(r => r.source === 'stock')
    if (tab === 'manual')  return ledger.filter(r => r.source === 'manual')
    return ledger
  }, [ledger, tab])

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

  function openEdit(row) {
    // Only manual entries are editable here. Stock entries link to /movements.
    if (row.source !== 'manual') return
    setForm({
      type: row.type,
      category: row.category,
      title: row.title,
      amount: String(row.amount),
      date: row.date,
      note: row.note ?? '',
    })
    setErrors({}); setEditItem(row); setShowForm(true)
  }

  function setF(k, v) {
    setForm(f => {
      if (k === 'type' && v !== f.type) return { ...f, type: v, category: CATEGORIES[v][0].value }
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
        const { error } = await supabase.from('finance_entries').update(payload).eq('id', editItem._id)
        if (error) throw error
        toast.success('แก้ไขรายการสำเร็จ')
      } else {
        const { error } = await supabase.from('finance_entries').insert({ ...payload, owner_id: ownerId, store_id: ownerId })
        if (error) throw error
        toast.success(form.type === 'income' ? 'บันทึกรายรับสำเร็จ' : 'บันทึกรายจ่ายสำเร็จ')
      }
      setShowForm(false)
      // Trigger reload
      setReloadKey(k => k + 1)
    } catch (err) {
      toast.error(userMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(row) {
    if (row.source !== 'manual') return
    try {
      const { error } = await supabase.from('finance_entries').delete().eq('id', row._id)
      if (error) throw error
      toast.success('ลบรายการสำเร็จ')
      setReloadKey(k => k + 1)
    } catch (err) {
      toast.error(userMessage(err))
    }
    setDelItem(null)
  }

  function handleExport() {
    const rows = [
      ['วันที่', 'แหล่งที่มา', 'ประเภท', 'หมวดหมู่', 'รายการ', 'จำนวน', 'ราคา/หน่วย', 'ยอดรวม', 'หมายเหตุ'],
      ...filtered.map(r => [
        fmtDate(r.date),
        r.source === 'stock' ? 'สต็อก' : 'บันทึกเอง',
        r.type === 'income' ? 'รายรับ' : 'รายจ่าย',
        r.categoryLabel,
        r.title + (r.sku ? ` (${r.sku})` : ''),
        r.qty,
        r.unitAmount,
        r.amount,
        r.note ?? '',
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
        <div style={{ marginTop: 24 }}><SkeletonTable rows={6} cols={6} /></div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="page">
        <div className="page-header"><div><h1 className="page-title">การเงิน</h1></div></div>
        <div className="login-error" style={{ marginTop: 16 }}>
          <I.Warning size={13} /> {loadError}
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setReloadKey(k => k + 1)}>
          ลองอีกครั้ง
        </button>
      </div>
    )
  }

  const stockCount  = ledger.filter(r => r.source === 'stock').length
  const manualCount = ledger.filter(r => r.source === 'manual').length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">การเงิน</h1>
          <p className="page-sub">
            {ledger.length} รายการ · จากสต็อก {stockCount} · บันทึกเอง {manualCount}
          </p>
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
        <FinanceStat label="รายรับรวม"  value={fmtCurrency(totals.income)}  unit={symbol} color={140} icon={I.TrendUp} />
        <FinanceStat label="รายจ่ายรวม" value={fmtCurrency(totals.expense)} unit={symbol} color={25}  icon={I.TrendDown} />
        <FinanceStat label="กำไรสุทธิ"  value={fmtCurrency(totals.profit)}  unit={symbol} color={totals.profit >= 0 ? 170 : 25} icon={I.Wallet} highlight={totals.profit >= 0 ? 'good' : 'bad'} />
        <FinanceStat label="อัตรากำไร"  value={`${totals.margin.toFixed(1)}%`} unit="" color={220} icon={I.Chart} />
      </div>

      {/* Breakdown */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <BreakdownCard title="ที่มาของรายรับ" color={140}>
          <BreakdownRow label="📤 ขายจากสต็อก" value={totals.stockIncome}  symbol={symbol} />
          <BreakdownRow label="✍️ บันทึกเอง"   value={totals.manualIncome} symbol={symbol} />
        </BreakdownCard>
        <BreakdownCard title="ที่มาของรายจ่าย" color={25}>
          <BreakdownRow label="🆕 เพิ่มสต็อกใหม่" value={totals.newStockExpense} symbol={symbol} />
          <BreakdownRow label="📦 รับสต็อก (เติม)" value={totals.restockExpense} symbol={symbol} />
          <BreakdownRow label="✍️ บันทึกเอง"      value={totals.manualExpense}  symbol={symbol} />
        </BreakdownCard>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginTop: 24, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {[
          { v: 'all',     l: `ทั้งหมด (${ledger.length})` },
          { v: 'income',  l: `รายรับ (${ledger.filter(r=>r.type==='income').length})` },
          { v: 'expense', l: `รายจ่าย (${ledger.filter(r=>r.type==='expense').length})` },
          { v: 'stock',   l: `จากสต็อก (${stockCount})` },
          { v: 'manual',  l: `บันทึกเอง (${manualCount})` },
        ].map(t => (
          <button key={t.v} onClick={() => setTab(t.v)} className="finance-tab" data-active={tab === t.v}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Ledger table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="ยังไม่มีรายการ"
          desc="เริ่มจากเพิ่มสต็อกใหม่ที่หน้า 'รายการสต็อก' หรือกด 'เพิ่มรายการ' ด้านบน"
          action={canWrite ? { label: 'เพิ่มรายการ', onClick: () => openAdd('income') } : undefined}
        />
      ) : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead><tr>
              <th>วันที่</th>
              <th>รายการ</th>
              <th>หมวดหมู่</th>
              <th style={{ textAlign: 'right' }}>จำนวน</th>
              <th style={{ textAlign: 'right' }}>ราคา/หน่วย</th>
              <th style={{ textAlign: 'right' }}>ยอดรวม</th>
              <th style={{ width: 90 }}></th>
            </tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td className="text-sm mono" style={{ whiteSpace: 'nowrap' }}>
                    {r.source === 'stock' ? fmtDateTime(r.date + 'T00:00:00') : fmtDate(r.date)}
                  </td>
                  <td>
                    <div className="plant-name">
                      {r.title}
                      {r.sku && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6, fontFamily: 'monospace' }}>{r.sku}</span>}
                    </div>
                    {r.note && <div className="plant-sci" style={{ fontStyle: 'normal' }}>{r.note}</div>}
                  </td>
                  <td>
                    <span className="badge" style={r.source === 'stock' ? { background: 'oklch(95% 0.03 220)', color: 'oklch(35% 0.10 220)' } : undefined}>
                      {r.categoryLabel}
                    </span>
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.qty > 1 ? `× ${r.qty}` : '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>
                    {r.qty > 1 ? `${fmtCurrency(r.unitAmount)} ${symbol}` : '—'}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', color: r.type === 'income' ? 'var(--accent-ink)' : 'var(--danger-ink)', fontWeight: 600 }}>
                    {r.type === 'income' ? '+' : '−'}{fmtCurrency(r.amount)} {symbol}
                  </td>
                  <td>
                    <div className="row-actions">
                      {r.source === 'manual' && canWrite && <button className="icon-btn" onClick={() => openEdit(r)} title="แก้ไข"><I.Edit size={13} /></button>}
                      {r.source === 'manual' && canDelete && <button className="icon-btn danger" onClick={() => setDelItem(r)} title="ลบ"><I.Trash size={13} /></button>}
                      {r.source === 'stock' && <span style={{ fontSize: 11, color: 'var(--muted)' }}>auto</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
