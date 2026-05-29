import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { fmtCurrency, fmtDate } from '../lib/utils'
import { userMessage } from '../lib/errors'
import { computePoTotal, remainingOnLine, validateReceive } from '../lib/po'
import Modal from '../components/Modal'
import Confirm from '../components/Confirm'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { SkeletonTable } from '../components/Skeleton'
import Field from '../components/Field'
import * as I from '../components/Icons'

const STATUS_LABEL = {
  draft: 'แบบร่าง',
  submitted: 'ส่งแล้ว',
  partial: 'รับบางส่วน',
  received: 'รับครบแล้ว',
  cancelled: 'ยกเลิก',
}
const STATUS_CLASS = {
  draft: '',
  submitted: 'badge--info',
  partial: 'badge--low',
  received: 'badge--info',
  cancelled: '',
}

export default function PurchaseOrdersPage() {
  const { toast } = useToast()
  const { ownerId, perms, isSuperAdmin } = useAuth()
  const { symbol } = useCurrency()
  const canCreate  = isSuperAdmin || perms.perm_receive
  const canCancel  = canCreate  // anyone who can edit can cancel; DB enforces store_admin for delete

  const [pos, setPos]         = useState([])
  const [linesMap, setLinesMap] = useState({})  // po_id → lines[]
  const [supplierMap, setSupplierMap] = useState({})
  const [plants, setPlants]   = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const [showCreate, setShowCreate]     = useState(false)
  const [receivingLine, setReceivingLine] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => { if (ownerId) load() }, [ownerId])

  async function load() {
    if (!ownerId) return
    setLoading(true)
    try {
      const [{ data: ps }, { data: ls }, { data: sups }, { data: pl }] = await Promise.all([
        supabase.from('purchase_orders').select('*').eq('store_id', ownerId).order('order_date', { ascending: false }),
        supabase.from('purchase_order_lines').select('*'),
        supabase.from('suppliers').select('id,name,code').eq('store_id', ownerId),
        supabase.from('plants').select('id,name,sku,cost').eq('store_id', ownerId).order('name'),
      ])
      setPos(ps ?? [])
      const m = {}
      ;(ls ?? []).forEach(l => { if (!m[l.po_id]) m[l.po_id] = []; m[l.po_id].push(l) })
      setLinesMap(m)
      setSuppliers(sups ?? [])
      setSupplierMap(Object.fromEntries((sups ?? []).map(s => [s.id, s])))
      setPlants(pl ?? [])
    } catch (err) {
      toast.error(`โหลดไม่สำเร็จ: ${userMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!statusFilter) return pos
    return pos.filter(p => p.status === statusFilter)
  }, [pos, statusFilter])

  function totalOf(poId) {
    return computePoTotal(linesMap[poId] ?? [])
  }

  async function cancelPO(po) {
    const { error } = await supabase.from('purchase_orders').update({ status: 'cancelled' }).eq('id', po.id)
    if (error) toast.error(`ยกเลิกไม่สำเร็จ: ${userMessage(error)}`)
    else { toast.success(`ยกเลิก ${po.po_number} สำเร็จ`); load() }
    setCancelTarget(null)
  }

  async function deletePO(po) {
    const { error } = await supabase.from('purchase_orders').delete().eq('id', po.id)
    if (error) toast.error(`ลบไม่สำเร็จ: ${userMessage(error)}`)
    else { toast.success(`ลบ ${po.po_number} สำเร็จ`); load() }
    setDeleteTarget(null)
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">ใบสั่งซื้อ</h1></div>
        <SkeletonTable rows={6} cols={6} />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">ใบสั่งซื้อ (Purchase Orders)</h1>
          <p className="page-sub">{pos.length} ใบสั่งซื้อ</p>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <I.Plus size={13} /> สร้าง PO ใหม่
          </button>
        )}
      </div>

      <div className="filters">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="ยังไม่มีใบสั่งซื้อ"
          desc="สร้าง PO เมื่อจะสั่งของจากซัพพลายเออร์ ระบบจะปรับสต็อกอัตโนมัติเมื่อรับเข้า"
          action={canCreate ? { label: 'สร้าง PO ใหม่', onClick: () => setShowCreate(true) } : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>เลข PO</th>
              <th>วันที่</th>
              <th>ซัพพลายเออร์</th>
              <th>สถานะ</th>
              <th className="text-right">มูลค่า</th>
              <th></th>
            </tr></thead>
            <tbody>
              {filtered.map(po => {
                const lines = linesMap[po.id] ?? []
                const total = totalOf(po.id)
                const expanded = expandedId === po.id
                return (
                  <React.Fragment key={po.id}>
                    <tr>
                      <td className="mono">{po.po_number}</td>
                      <td className="text-sm">{fmtDate(po.order_date)}</td>
                      <td>{supplierMap[po.supplier_id]?.name ?? <span className="muted">—</span>}</td>
                      <td><span className={`badge ${STATUS_CLASS[po.status] ?? ''}`}>{STATUS_LABEL[po.status] ?? po.status}</span></td>
                      <td className="mono text-right">{fmtCurrency(total)} {symbol}</td>
                      <td>
                        <div className="row-end-sm">
                          <button className="btn btn-ghost btn-sm"
                                  onClick={() => setExpandedId(expanded ? null : po.id)}>
                            {expanded ? 'ซ่อน' : `รายการ (${lines.length})`}
                          </button>
                          {canCancel && po.status !== 'cancelled' && po.status !== 'received' && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setCancelTarget(po)}>
                              ยกเลิก
                            </button>
                          )}
                          {(isSuperAdmin || perms.perm_manage_plants) && (
                            <button className="btn btn-ghost btn-sm text-red" onClick={() => setDeleteTarget(po)}>
                              ลบ
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={6} className="expanded-cell">
                          <POLinesPanel
                            po={po}
                            lines={lines}
                            symbol={symbol}
                            canReceive={canCreate}
                            onReceive={(line) => setReceivingLine({ po, line })}
                          />
                          {po.note && (
                            <div className="text-sm muted" style={{ marginTop: 8 }}>
                              หมายเหตุ: {po.note}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreatePOModal
          storeId={ownerId}
          plants={plants}
          suppliers={suppliers}
          symbol={symbol}
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); load() }}
        />
      )}

      {receivingLine && (
        <ReceiveLineModal
          po={receivingLine.po}
          line={receivingLine.line}
          onClose={() => setReceivingLine(null)}
          onDone={() => { setReceivingLine(null); load() }}
        />
      )}

      {cancelTarget && (
        <Confirm
          title="ยืนยันการยกเลิก"
          desc={`ยกเลิก ${cancelTarget.po_number}? PO ที่ยกเลิกแล้วจะไม่สามารถรับเข้าได้`}
          confirmLabel="ยกเลิก PO"
          onConfirm={() => cancelPO(cancelTarget)}
          onCancel={() => setCancelTarget(null)}
        />
      )}

      {deleteTarget && (
        <Confirm
          title="ลบ PO" danger
          desc={`ลบ ${deleteTarget.po_number} ออกจากระบบถาวร? movement ที่เกิดจากการรับเข้าจะยังอยู่`}
          confirmLabel="ลบถาวร"
          onConfirm={() => deletePO(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function POLinesPanel({ po, lines, symbol, canReceive, onReceive }) {
  return (
    <table style={{ width: '100%', fontSize: 13 }}>
      <thead>
        <tr>
          <th className="text-left">สินค้า</th>
          <th className="text-right">สั่ง</th>
          <th className="text-right">รับแล้ว</th>
          <th className="text-right">คงเหลือ</th>
          <th className="text-right">ต้นทุน/หน่วย</th>
          <th className="text-right">มูลค่า</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {lines.map(l => {
          const remaining = remainingOnLine(l)
          return (
            <tr key={l.id}>
              <td>
                <div>{l.plant_name}</div>
                {l.plant_sku && <div className="mono text-xs muted">{l.plant_sku}</div>}
              </td>
              <td className="mono text-right">{l.qty_ordered}</td>
              <td className="mono text-right">{l.qty_received}</td>
              <td className="mono text-right" style={{ color: remaining > 0 ? 'var(--warning, #ca8a04)' : 'var(--accent, #16a34a)' }}>{remaining}</td>
              <td className="mono text-right">{Number(l.unit_cost).toFixed(2)} {symbol}</td>
              <td className="mono text-right">
                {(Number(l.qty_ordered) * Number(l.unit_cost)).toFixed(2)} {symbol}
              </td>
              <td className="text-right">
                {canReceive && remaining > 0 && (po.status === 'submitted' || po.status === 'partial') && (
                  <button className="btn btn-primary btn-xs" onClick={() => onReceive(l)}>
                    รับเข้า
                  </button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function CreatePOModal({ storeId, plants, suppliers, symbol, onClose, onDone }) {
  const { toast } = useToast()
  const [supplierId, setSupplierId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState([])  // [{ plant_id, qty, unit_cost }]
  const [busy, setBusy] = useState(false)

  function addRow() { setRows(r => [...r, { plant_id: '', qty: 1, unit_cost: 0 }]) }
  function setRow(i, k, v) { setRows(r => r.map((row, idx) => idx === i ? { ...row, [k]: v } : row)) }
  function removeRow(i) { setRows(r => r.filter((_, idx) => idx !== i)) }
  function onPlantChange(i, plantId) {
    const p = plants.find(pl => pl.id === plantId)
    setRows(r => r.map((row, idx) => idx === i ? { ...row, plant_id: plantId, unit_cost: p?.cost ?? row.unit_cost } : row))
  }

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.qty) * Number(r.unit_cost), 0), [rows])

  async function handleSubmit(e) {
    e.preventDefault()
    if (rows.length === 0) { toast.error('เพิ่มรายการสินค้าอย่างน้อย 1 รายการ'); return }
    const valid = rows.every(r => r.plant_id && Number(r.qty) > 0)
    if (!valid) { toast.error('กรอกข้อมูลรายการให้ครบ (สินค้า + จำนวน > 0)'); return }
    setBusy(true)
    try {
      const { data: poNo, error: nErr } = await supabase.rpc('next_po_number', { p_store: storeId })
      if (nErr) throw nErr
      const { data: poRow, error: pErr } = await supabase.from('purchase_orders').insert({
        store_id: storeId,
        po_number: poNo,
        supplier_id: supplierId || null,
        status: 'submitted',
        expected_date: expectedDate || null,
        note: note.trim() || null,
      }).select().single()
      if (pErr) throw pErr

      const linePayload = rows.map(r => {
        const p = plants.find(pl => pl.id === r.plant_id)
        return {
          po_id: poRow.id,
          plant_id: r.plant_id,
          plant_name: p?.name ?? '(unknown)',
          plant_sku: p?.sku ?? null,
          qty_ordered: Number(r.qty),
          unit_cost: Number(r.unit_cost),
        }
      })
      const { error: lErr } = await supabase.from('purchase_order_lines').insert(linePayload)
      if (lErr) throw lErr

      toast.success(`สร้าง ${poNo} สำเร็จ`)
      onDone()
    } catch (err) {
      toast.error(`สร้างไม่สำเร็จ: ${userMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="สร้างใบสั่งซื้อ" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
          <Field label="ซัพพลายเออร์">
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="วันที่คาดว่าจะรับ">
            <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
          </Field>
          <Field label="หมายเหตุ">
            <input value={note} onChange={e => setNote(e.target.value)} />
          </Field>
        </div>

        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong className="text-md">รายการสินค้า</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>
            <I.Plus size={11} /> เพิ่มรายการ
          </button>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 8, maxHeight: 320, overflow: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead style={{ background: 'var(--bg)' }}>
              <tr>
                <th className="text-left">สินค้า</th>
                <th className="text-right" style={{ width: 90 }}>จำนวน</th>
                <th className="text-right" style={{ width: 120 }}>ต้นทุน/หน่วย</th>
                <th className="text-right" style={{ width: 120 }}>รวม</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="text-center muted" style={{ padding: 16 }}>กดปุ่ม "เพิ่มรายการ" เพื่อเริ่ม</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <select value={r.plant_id} onChange={e => onPlantChange(i, e.target.value)} style={{ width: '100%' }}>
                      <option value="">— เลือก —</option>
                      {plants.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                  </td>
                  <td><input type="number" min="1" value={r.qty} onChange={e => setRow(i, 'qty', e.target.value)} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td><input type="number" min="0" step="0.01" value={r.unit_cost} onChange={e => setRow(i, 'unit_cost', e.target.value)} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td className="mono text-right">{(Number(r.qty) * Number(r.unit_cost)).toFixed(2)}</td>
                  <td><button type="button" className="icon-btn danger" onClick={() => removeRow(i)}><I.X size={12} /></button></td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td colSpan={3} className="text-right fw-600">รวม</td>
                  <td className="mono text-right" style={{ fontWeight: 700 }}>{total.toFixed(2)} {symbol}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="form-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={busy || rows.length === 0}>
            {busy ? <Spinner size={14} color="#fff" /> : 'สร้าง PO'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ReceiveLineModal({ po, line, onClose, onDone }) {
  const { toast } = useToast()
  const remaining = remainingOnLine(line)
  const [qty, setQty] = useState(String(remaining))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const check = validateReceive({ line, qty })
    if (!check.ok) { toast.error(check.error); return }
    setBusy(true)
    const { error } = await supabase.rpc('receive_po_line', {
      p_line_id: line.id, p_qty: check.willReceive, p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) { toast.error(`รับเข้าไม่สำเร็จ: ${userMessage(error)}`); return }
    toast.success(`รับเข้า ${check.willReceive} หน่วยสำเร็จ`)
    onDone()
  }

  return (
    <Modal title={`รับเข้า: ${line.plant_name}`} onClose={onClose} size="sm">
      <p className="text-md muted" style={{ marginTop: 0 }}>
        PO {po.po_number} · สั่ง {line.qty_ordered} · รับแล้ว {line.qty_received} · คงเหลือ {remaining}
      </p>
      <form onSubmit={handleSubmit} className="form-col">
        <Field label="จำนวนที่รับเข้า" required>
          <input type="number" min="1" max={remaining} value={qty} onChange={e => setQty(e.target.value)} autoFocus />
        </Field>
        <Field label="หมายเหตุ (ไม่บังคับ)" hint="เช่น lot number, สภาพสินค้า">
          <input value={note} onChange={e => setNote(e.target.value)} />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Spinner size={14} color="#fff" /> : 'ยืนยันรับเข้า'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
