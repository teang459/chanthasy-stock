import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { userMessage } from '../lib/errors'
import { fmtCurrency, fmtDate } from '../lib/utils'
import Spinner from '../components/Spinner'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import * as I from '../components/Icons'

const SettlementReport = lazy(() => import('../components/SettlementReport'))

function fmtMoney(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUS_LABEL = { open: 'เปิดอยู่', closed: 'ปิดแล้ว', reopened: 'เปิดซ้ำ' }

export default function SettlementPage() {
  const { ownerId: storeId, stores, currentStoreId, perms, isSuperAdmin } = useAuth()
  const { toast } = useToast()
  const { symbol } = useCurrency()

  const [today, setToday]         = useState(null)   // today's daily_settlements row (or null)
  const [history, setHistory]     = useState([])
  const [liveSales, setLiveSales] = useState(null)   // running totals before close
  const [loading, setLoading]     = useState(true)
  const [showOpen, setShowOpen]   = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [reportFor, setReportFor] = useState(null)

  const [openingCash, setOpeningCash] = useState('0')
  const [closingCash, setClosingCash] = useState('0')
  const [closeNote, setCloseNote]     = useState('')
  const [busy, setBusy]               = useState(false)

  const currentStore = stores.find(s => s.id === currentStoreId)
  const canSettle = perms.perm_settle

  useEffect(() => { if (storeId) load() }, [storeId])

  async function load() {
    if (!storeId) return
    setLoading(true)
    try {
      // Today's row (using Asia/Bangkok date)
      const tzDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
      const [{ data: t }, { data: h }] = await Promise.all([
        supabase.from('daily_settlements').select('*').eq('store_id', storeId).eq('business_date', tzDate).maybeSingle(),
        supabase.from('daily_settlements').select('*').eq('store_id', storeId).order('business_date', { ascending: false }).limit(30),
      ])
      setToday(t ?? null)
      setHistory(h ?? [])
      if (t && t.status !== 'closed') await loadLive(t.id)
      else setLiveSales(null)
    } catch (err) {
      toast.error(`โหลดข้อมูลไม่สำเร็จ: ${userMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadLive(settlementId) {
    const [{ data: m }, { data: f }] = await Promise.all([
      supabase.from('movements').select('type, qty, payment_method, plants(price,cost)').eq('settlement_id', settlementId),
      supabase.from('finance_entries').select('type, amount').eq('settlement_id', settlementId),
    ])
    let sales = 0, cashSales = 0, cost = 0, income = 0, expense = 0, salesCount = 0
    ;(m ?? []).forEach(mv => {
      if (mv.type !== 'out') return
      const qty = Math.abs(mv.qty ?? 0)
      const p = Number(mv.plants?.price ?? 0)
      const c = Number(mv.plants?.cost ?? 0)
      sales += qty * p
      cost  += qty * c
      if (!mv.payment_method || mv.payment_method === 'cash') cashSales += qty * p
      salesCount++
    })
    ;(f ?? []).forEach(fe => {
      if (fe.type === 'income') income += Number(fe.amount ?? 0)
      else if (fe.type === 'expense') expense += Number(fe.amount ?? 0)
    })
    setLiveSales({ sales, cashSales, cost, income, expense, salesCount })
  }

  async function handleOpen() {
    const opening = Number(openingCash)
    if (!Number.isFinite(opening) || opening < 0) { toast.error('เงินสดตั้งต้นต้อง ≥ 0'); return }
    setBusy(true)
    const { error } = await supabase.rpc('open_day', { p_store: storeId, p_opening: opening })
    setBusy(false)
    if (error) { toast.error(`เปิดยอดไม่สำเร็จ: ${userMessage(error)}`); return }
    toast.success('เปิดยอดสำเร็จ')
    setShowOpen(false)
    setOpeningCash('0')
    load()
  }

  async function handleClose() {
    const closing = Number(closingCash)
    if (!Number.isFinite(closing) || closing < 0) { toast.error('เงินสดที่นับได้ต้อง ≥ 0'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('settle_day', {
      p_store: storeId,
      p_date: today.business_date,
      p_closing: closing,
      p_note: closeNote.trim() || null,
    })
    setBusy(false)
    if (error) { toast.error(`ปิดยอดไม่สำเร็จ: ${userMessage(error)}`); return }
    toast.success('ปิดยอดสำเร็จ')
    setShowClose(false)
    setCloseNote('')
    load()
    if (data) setReportFor(data)
  }

  const liveExpected = useMemo(() => {
    if (!today || !liveSales) return null
    return Number(today.opening_cash) + liveSales.cashSales + liveSales.income - liveSales.expense
  }, [today, liveSales])

  if (loading) {
    return <div className="page"><div className="page-header"><h1 className="page-title">ปิดยอดประจำวัน</h1></div><div className="page-center"><Spinner size={32} /></div></div>
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">ปิดยอดประจำวัน</h1>
          <p className="page-sub">
            {currentStore?.name ?? ''} · {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
        {!canSettle && (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            <I.Lock size={12} /> คุณไม่มีสิทธิ์ปิดยอด — ติดต่อ store admin
          </div>
        )}
      </div>

      {/* Today panel */}
      <section className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="card-header" style={{ marginBottom: 16 }}>
          <h2 className="card-title">วันนี้</h2>
          {today && (
            <span className={`badge badge--${today.status === 'closed' ? 'low' : 'info'}`}>
              {STATUS_LABEL[today.status] ?? today.status}
            </span>
          )}
        </div>

        {!today && canSettle && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ color: 'var(--muted)', marginBottom: 16 }}>ยังไม่ได้เปิดยอดวันนี้</p>
            <button className="btn btn-primary" onClick={() => setShowOpen(true)}>
              <I.Plus size={13} /> เปิดยอดวันนี้
            </button>
          </div>
        )}

        {today && today.status !== 'closed' && (
          <div>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <SmallStat label="เงินสดตั้งต้น" value={fmtMoney(today.opening_cash)} unit={symbol} />
              <SmallStat label="ยอดขายรวม"     value={fmtMoney(liveSales?.sales ?? 0)} unit={symbol} />
              <SmallStat label="ยอดขายเงินสด" value={fmtMoney(liveSales?.cashSales ?? 0)} unit={symbol} />
              <SmallStat label="เงินสดคาดหวัง" value={fmtMoney(liveExpected ?? 0)} unit={symbol} highlight />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
              {liveSales?.salesCount ?? 0} รายการขาย · รายรับเพิ่ม {fmtMoney(liveSales?.income ?? 0)} · รายจ่าย {fmtMoney(liveSales?.expense ?? 0)}
            </div>
            {canSettle && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-primary" onClick={() => { setClosingCash(String(Math.round(liveExpected ?? 0))); setShowClose(true) }}>
                  <I.Lock size={13} /> ปิดยอด
                </button>
              </div>
            )}
          </div>
        )}

        {today && today.status === 'closed' && (
          <ClosedSummary row={today} symbol={symbol} onPrint={() => setReportFor(today)} isSuperAdmin={isSuperAdmin} onReopen={load} />
        )}
      </section>

      {/* History */}
      <section className="card" style={{ padding: 20 }}>
        <div className="card-header"><h2 className="card-title">ประวัติปิดยอด (30 รายการล่าสุด)</h2></div>
        {history.length === 0 ? (
          <EmptyState title="ยังไม่มีประวัติ" desc="เปิดยอดและปิดยอดเป็นประจำเพื่อสร้างรายงานสรุป" />
        ) : (
          <div className="table-wrap" style={{ margin: 0 }}>
            <table>
              <thead><tr>
                <th>วันที่</th>
                <th>สถานะ</th>
                <th style={{ textAlign: 'right' }}>ยอดขาย</th>
                <th style={{ textAlign: 'right' }}>กำไรสุทธิ</th>
                <th style={{ textAlign: 'right' }}>เงินสดที่นับ</th>
                <th style={{ textAlign: 'right' }}>ส่วนต่าง</th>
                <th></th>
              </tr></thead>
              <tbody>
                {history.map(r => (
                  <tr key={r.id}>
                    <td className="mono">{fmtDate(r.business_date)}</td>
                    <td><span className={`badge ${r.status === 'closed' ? 'badge--low' : 'badge--info'}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r.total_sales != null ? `${fmtMoney(r.total_sales)} ${symbol}` : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r.net_sales != null ? `${fmtMoney(r.net_sales)} ${symbol}` : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r.closing_cash != null ? `${fmtMoney(r.closing_cash)} ${symbol}` : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right', color: r.difference == null ? undefined : (Number(r.difference) === 0 ? 'var(--muted)' : Number(r.difference) > 0 ? 'var(--accent, #16a34a)' : 'var(--danger, #dc2626)') }}>
                      {r.difference != null ? `${Number(r.difference) > 0 ? '+' : ''}${fmtMoney(r.difference)}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {r.status === 'closed' && (
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setReportFor(r)}>
                          ใบสรุป
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Open modal */}
      {showOpen && (
        <Modal title="เปิดยอดประจำวัน" onClose={() => setShowOpen(false)} size="sm">
          <p style={{ marginTop: 0, fontSize: 13, color: 'var(--muted)' }}>
            ระบุเงินสดในลิ้นชักก่อนเริ่มขายวันนี้
          </p>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>เงินสดตั้งต้น ({symbol})</label>
            <input type="number" min="0" step="0.01" value={openingCash} onChange={e => setOpeningCash(e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setShowOpen(false)}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={handleOpen} disabled={busy}>
              {busy ? <Spinner size={14} color="#fff" /> : 'เปิดยอด'}
            </button>
          </div>
        </Modal>
      )}

      {/* Close modal */}
      {showClose && today && (
        <Modal title="ปิดยอดประจำวัน" onClose={() => setShowClose(false)} size="sm">
          <p style={{ marginTop: 0, fontSize: 13, color: 'var(--muted)' }}>
            ยอดเงินสดที่คาดหวัง: <strong className="mono">{fmtMoney(liveExpected ?? 0)} {symbol}</strong>
          </p>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>เงินสดที่นับได้จริง ({symbol})</label>
            <input type="number" min="0" step="0.01" value={closingCash} onChange={e => setClosingCash(e.target.value)} autoFocus />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>หมายเหตุ (ไม่บังคับ)</label>
            <input value={closeNote} onChange={e => setCloseNote(e.target.value)} placeholder="เช่น ส่วนต่างเกิดจาก…" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setShowClose(false)}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={handleClose} disabled={busy}>
              {busy ? <Spinner size={14} color="#fff" /> : 'ปิดยอด'}
            </button>
          </div>
        </Modal>
      )}

      {/* Z-report */}
      {reportFor && (
        <Suspense fallback={null}>
          <SettlementReport row={reportFor} store={currentStore} symbol={symbol} onClose={() => setReportFor(null)} />
        </Suspense>
      )}
    </div>
  )
}

function SmallStat({ label, value, unit, highlight }) {
  return (
    <div className={`stat ${highlight ? 'stat--alert' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        <span className="mono">{value}</span>
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
    </div>
  )
}

function ClosedSummary({ row, symbol, onPrint, isSuperAdmin, onReopen }) {
  const { toast } = useToast()
  const [reopenBusy, setReopenBusy] = useState(false)

  async function handleReopen() {
    const reason = window.prompt('ระบุเหตุผลในการเปิดยอดซ้ำ (สำหรับ audit log):')
    if (!reason?.trim()) return
    setReopenBusy(true)
    const { error } = await supabase.rpc('reopen_settlement', { p_id: row.id, p_reason: reason.trim() })
    setReopenBusy(false)
    if (error) { toast.error(`เปิดซ้ำไม่สำเร็จ: ${userMessage(error)}`); return }
    toast.success('เปิดยอดซ้ำสำเร็จ')
    onReopen?.()
  }

  return (
    <div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <SmallStat label="ยอดขายรวม"   value={fmtMoney(row.total_sales)}   unit={symbol} />
        <SmallStat label="ต้นทุน"      value={fmtMoney(row.total_cost)}    unit={symbol} />
        <SmallStat label="กำไรสุทธิ"   value={fmtMoney(row.net_sales)}     unit={symbol} highlight />
        <SmallStat label="ส่วนต่าง"    value={fmtMoney(row.difference)}    unit={symbol} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
        VAT {fmtMoney(row.total_vat)} · รายรับเพิ่ม {fmtMoney(row.total_income)} · รายจ่าย {fmtMoney(row.total_expense)} · เงินสดที่นับได้ {fmtMoney(row.closing_cash)} {symbol}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        {isSuperAdmin && (
          <button className="btn btn-ghost" onClick={handleReopen} disabled={reopenBusy}>
            {reopenBusy ? <Spinner size={13} /> : 'เปิดยอดซ้ำ'}
          </button>
        )}
        <button className="btn btn-primary" onClick={onPrint}>
          <I.Download size={13} /> พิมพ์ใบสรุป (Z-report)
        </button>
      </div>
    </div>
  )
}
