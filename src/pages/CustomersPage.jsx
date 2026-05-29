import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { fmtCurrency, fmtDate, downloadCSV } from '../lib/utils'
import { userMessage } from '../lib/errors'
import Modal from '../components/Modal'
import Confirm from '../components/Confirm'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { SkeletonTable } from '../components/Skeleton'
import Field from '../components/Field'
import * as I from '../components/Icons'

const EMPTY = { code: '', name: '', phone: '', email: '', line_id: '', address: '', tax_id: '', note: '', active: true }

export default function CustomersPage() {
  const { toast } = useToast()
  const { ownerId, perms } = useAuth()
  const { symbol } = useCurrency()
  const canWrite  = !!ownerId
  const canDelete = perms.perm_manage_plants  // delete is store_admin-ish

  const [customers, setCustomers] = useState([])
  const [stats, setStats]         = useState({})    // customer_id → { count, total }
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [editItem, setEditItem]   = useState(null)
  const [delItem, setDelItem]     = useState(null)
  const [historyFor, setHistoryFor] = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [errors, setErrors]       = useState({})
  const [saving, setSaving]       = useState(false)

  useEffect(() => { if (ownerId) load() }, [ownerId])

  async function load() {
    if (!ownerId) return
    setLoading(true)
    try {
      const [{ data: cs, error: cErr }, { data: ms }] = await Promise.all([
        supabase.from('customers').select('*').eq('store_id', ownerId).order('name'),
        supabase.from('movements')
          .select('customer_id, qty, plants(price)')
          .eq('store_id', ownerId)
          .eq('type', 'out')
          .not('customer_id', 'is', null),
      ])
      if (cErr) throw cErr
      setCustomers(cs ?? [])
      const agg = {}
      ;(ms ?? []).forEach(m => {
        if (!m.customer_id) return
        const total = Math.abs(m.qty ?? 0) * Number(m.plants?.price ?? 0)
        if (!agg[m.customer_id]) agg[m.customer_id] = { count: 0, total: 0 }
        agg[m.customer_id].count++
        agg[m.customer_id].total += total
      })
      setStats(agg)
    } catch (err) {
      toast.error(`โหลดไม่สำเร็จ: ${userMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }

  function openAdd() { setForm(EMPTY); setErrors({}); setEditItem(null); setShowForm(true) }
  function openEdit(c) { setForm({ ...EMPTY, ...c }); setErrors({}); setEditItem(c); setShowForm(true) }
  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function validate(f) {
    const e = {}
    if (!f.name?.trim()) e.name = 'กรุณาระบุชื่อ'
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'อีเมลไม่ถูกต้อง'
    return e
  }

  async function handleSave(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const payload = {
        code: form.code?.trim() || null,
        name: form.name.trim(),
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        line_id: form.line_id?.trim() || null,
        address: form.address?.trim() || null,
        tax_id: form.tax_id?.trim() || null,
        note: form.note?.trim() || null,
        active: !!form.active,
      }
      if (editItem) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editItem.id)
        if (error) throw error
        toast.success('แก้ไขลูกค้าสำเร็จ')
      } else {
        const { error } = await supabase.from('customers').insert({ ...payload, store_id: ownerId })
        if (error) throw error
        toast.success('เพิ่มลูกค้าสำเร็จ')
      }
      setShowForm(false); load()
    } catch (err) {
      if (err.code === '23505') setErrors({ code: 'รหัสนี้มีอยู่แล้วในร้าน' })
      else toast.error(userMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c) {
    const { error } = await supabase.from('customers').delete().eq('id', c.id)
    if (error) toast.error(`ลบไม่สำเร็จ: ${userMessage(error)}`)
    else { toast.success('ลบลูกค้าสำเร็จ'); load() }
    setDelItem(null)
  }

  const filtered = useMemo(() => {
    if (!search) return customers
    const q = search.toLowerCase()
    return customers.filter(c =>
      c.name?.toLowerCase().includes(q)
      || c.code?.toLowerCase().includes(q)
      || c.phone?.toLowerCase().includes(q)
      || c.email?.toLowerCase().includes(q)
    )
  }, [customers, search])

  function handleExport() {
    const rows = [
      ['รหัส', 'ชื่อ', 'โทร', 'อีเมล', 'LINE', 'ที่อยู่', 'เลขผู้เสียภาษี', 'ครั้ง', 'ยอดรวม', 'หมายเหตุ'],
      ...filtered.map(c => [
        c.code ?? '', c.name, c.phone ?? '', c.email ?? '', c.line_id ?? '',
        c.address ?? '', c.tax_id ?? '',
        stats[c.id]?.count ?? 0,
        stats[c.id]?.total ?? 0,
        c.note ?? '',
      ]),
    ]
    downloadCSV(rows, `customers-${new Date().toISOString().slice(0,10)}.csv`)
    toast.success('ส่งออก CSV สำเร็จ')
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">ลูกค้า</h1></div>
        <SkeletonTable rows={6} cols={5} />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">ลูกค้า</h1>
          <p className="page-sub">{customers.length} รายการ</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={handleExport}><I.Download size={13} /> ส่งออก</button>
          {canWrite && <button className="btn btn-primary" onClick={openAdd}><I.Plus size={13} /> เพิ่มลูกค้า</button>}
        </div>
      </div>

      <div className="filters">
        <div className="search-wrap">
          <I.Search size={13} className="search-icon" />
          <input placeholder="ค้นหา ชื่อ / เบอร์ / อีเมล…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={() => setSearch('')}><I.X size={12} /></button>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={search ? 'ไม่พบลูกค้า' : 'ยังไม่มีลูกค้า'}
          desc={search ? 'ลองเปลี่ยนคำค้นหา' : 'เพิ่มลูกค้ารายแรก'}
          action={!search && canWrite ? { label: 'เพิ่มลูกค้า', onClick: openAdd } : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>ชื่อลูกค้า</th>
              <th>ติดต่อ</th>
              <th className="text-right">ครั้งซื้อ</th>
              <th className="text-right">ยอดสะสม</th>
              <th></th>
            </tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
                  <td>
                    <div className="fw-500">{c.name}</div>
                    {c.code && <div className="mono text-xs muted">{c.code}</div>}
                    {c.tax_id && <div className="mono text-xs muted">{c.tax_id}</div>}
                  </td>
                  <td style={{ fontSize: 12, lineHeight: 1.5 }}>
                    {c.phone && <div>📞 {c.phone}</div>}
                    {c.email && <div className="muted">{c.email}</div>}
                    {c.line_id && <div className="muted">LINE: {c.line_id}</div>}
                  </td>
                  <td className="mono text-right">{stats[c.id]?.count ?? 0}</td>
                  <td className="mono text-right">
                    {fmtCurrency(stats[c.id]?.total ?? 0)} {symbol}
                  </td>
                  <td className="text-right">
                    <button className="icon-btn" title="ประวัติซื้อ" onClick={() => setHistoryFor(c)}><I.History size={13} /></button>
                    {canWrite && <button className="icon-btn" title="แก้ไข" onClick={() => openEdit(c)}><I.Edit size={13} /></button>}
                    {canDelete && <button className="icon-btn danger" title="ลบ" onClick={() => setDelItem(c)}><I.Trash size={13} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title={editItem ? `แก้ไขลูกค้า: ${editItem.name}` : 'เพิ่มลูกค้า'} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSave} className="form-grid">
            <Field label="ชื่อลูกค้า" required error={errors.name}>
              <input value={form.name} onChange={e => setF('name', e.target.value)} autoFocus />
            </Field>
            <Field label="รหัส (ไม่บังคับ)" error={errors.code} hint="เช่น CUS001">
              <input value={form.code} onChange={e => setF('code', e.target.value)} />
            </Field>
            <Field label="เบอร์โทร"><input value={form.phone} onChange={e => setF('phone', e.target.value)} /></Field>
            <Field label="อีเมล" error={errors.email}><input value={form.email} onChange={e => setF('email', e.target.value)} type="email" /></Field>
            <Field label="LINE ID"><input value={form.line_id} onChange={e => setF('line_id', e.target.value)} /></Field>
            <Field label="เลขผู้เสียภาษี" hint="สำหรับลูกค้านิติบุคคล"><input value={form.tax_id} onChange={e => setF('tax_id', e.target.value)} /></Field>
            <Field label="ที่อยู่" className="field--full">
              <input value={form.address} onChange={e => setF('address', e.target.value)} />
            </Field>
            <Field label="หมายเหตุ" className="field--full">
              <input value={form.note} onChange={e => setF('note', e.target.value)} />
            </Field>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={form.active} onChange={e => setF('active', e.target.checked)} />
                <span>เปิดใช้งานลูกค้านี้</span>
              </label>
            </div>
            <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Spinner size={14} color="#fff" /> : 'บันทึก'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {delItem && (
        <Confirm title="ลบลูกค้า" danger
          desc={`ลบลูกค้า "${delItem.name}" ออกจากระบบ? ประวัติการซื้อจะยังอยู่ แต่จะไม่ผูกกับลูกค้านี้`}
          confirmLabel="ลบ" onConfirm={() => handleDelete(delItem)} onCancel={() => setDelItem(null)}
        />
      )}

      {historyFor && (
        <CustomerHistory customer={historyFor} storeId={ownerId} symbol={symbol} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  )
}

function CustomerHistory({ customer, storeId, symbol, onClose }) {
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('movements')
        .select('id, type, qty, note, created_at, payment_method, plants(name, sku, price)')
        .eq('store_id', storeId)
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) toast.error(`โหลดประวัติไม่สำเร็จ: ${userMessage(error)}`)
      setRows(data ?? [])
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id, storeId])

  return (
    <Modal title={`ประวัติซื้อ: ${customer.name}`} onClose={onClose} size="lg">
      {loading ? (
        <div className="page-center"><Spinner size={28} /></div>
      ) : rows.length === 0 ? (
        <EmptyState title="ยังไม่มีประวัติ" desc="ลูกค้าคนนี้ยังไม่เคยซื้อสินค้า" />
      ) : (
        <div className="table-wrap no-m">
          <table>
            <thead><tr>
              <th>วันที่</th>
              <th>สินค้า</th>
              <th className="text-right">จำนวน</th>
              <th className="text-right">ยอด</th>
              <th>ชำระ</th>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const qty = Math.abs(r.qty ?? 0)
                const total = qty * Number(r.plants?.price ?? 0)
                return (
                  <tr key={r.id}>
                    <td className="mono text-sm">{fmtDate(r.created_at)}</td>
                    <td>
                      <div>{r.plants?.name ?? '—'}</div>
                      <div className="mono text-xs muted">{r.plants?.sku ?? ''}</div>
                    </td>
                    <td className="mono text-right">{qty}</td>
                    <td className="mono text-right">{fmtCurrency(total)} {symbol}</td>
                    <td className="text-sm muted">{r.payment_method ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
