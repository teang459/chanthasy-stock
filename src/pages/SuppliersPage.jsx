import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import Modal from '../components/Modal'
import Confirm from '../components/Confirm'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import Field from '../components/Field'
import * as I from '../components/Icons'
import { userMessage } from '../lib/errors'

const EMPTY = { code:'', name:'', contact:'', phone:'', email:'', note:'' }

export default function SuppliersPage() {
  const { toast } = useToast()
  const { user, ownerId, profile } = useAuth()
  const canWrite  = !profile?.manager_id || ['admin', 'staff'].includes(profile?.role)
  const canDelete = !profile?.manager_id || profile?.role === 'admin'
  const [sups, setSups]         = useState([])
  const [counts, setCounts]     = useState({})
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [delItem, setDelItem]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [errors, setErrors]     = useState({})
  const [saving, setSaving]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('plants').select('supplier_id'),
    ])
    setSups(s ?? [])
    const cnt = {}
    ;(p ?? []).forEach(pl => { if (pl.supplier_id) cnt[pl.supplier_id] = (cnt[pl.supplier_id] ?? 0) + 1 })
    setCounts(cnt)
    setLoading(false)
  }

  function validate(f) {
    const e = {}
    if (!f.code?.trim()) e.code = 'กรุณาระบุรหัส'
    if (!f.name?.trim()) e.name = 'กรุณาระบุชื่อ'
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'อีเมลไม่ถูกต้อง'
    return e
  }

  function openAdd() { setForm(EMPTY); setErrors({}); setEditItem(null); setShowForm(true) }
  function openEdit(s) { setForm({ code:s.code, name:s.name, contact:s.contact??'', phone:s.phone??'', email:s.email??'', note:s.note??'' }); setErrors({}); setEditItem(s); setShowForm(true) }
  function setF(k,v) { setForm(f=>({...f,[k]:v})) }

  async function handleSave(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const payload = { code:form.code.trim(), name:form.name.trim(), contact:form.contact?.trim()||null, phone:form.phone?.trim()||null, email:form.email?.trim()||null, note:form.note?.trim()||null }
      if (editItem) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editItem.id)
        if (error) throw error
        toast.success('แก้ไขซัพพลายเออร์สำเร็จ')
      } else {
        const { error } = await supabase.from('suppliers').insert({ ...payload, owner_id: ownerId })
        if (error) throw error
        toast.success('เพิ่มซัพพลายเออร์สำเร็จ')
      }
      setShowForm(false)
      load()
    } catch (err) {
      if (err.code === '23505') setErrors({ code: 'รหัสนี้มีอยู่แล้วในร้านของคุณ' })
      else toast.error(userMessage(err))
    } finally { setSaving(false) }
  }

  async function handleDelete(s) {
    try {
      const { error } = await supabase.from('suppliers').delete().eq('id', s.id)
      if (error) throw error
      toast.success('ลบซัพพลายเออร์สำเร็จ')
      load()
    } catch (err) { toast.error(userMessage(err)) }
    setDelItem(null)
  }

  const filtered = useMemo(() => {
    if (!search) return sups
    const q = search.toLowerCase()
    return sups.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.contact?.toLowerCase().includes(q))
  }, [sups, search])

  if (loading) return <div className="page-center"><Spinner size={32} /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">ซัพพลายเออร์</h1><p className="page-sub">{sups.length} ราย</p></div>
        {canWrite && <button className="btn btn-primary" onClick={openAdd}><I.Plus size={13} /> เพิ่มซัพพลายเออร์</button>}
      </div>

      <div className="filters">
        <div className="search-wrap">
          <I.Search size={13} className="search-icon" />
          <input placeholder="ค้นหา…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={() => setSearch('')}><I.X size={12} /></button>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="ไม่พบซัพพลายเออร์" desc="เริ่มเพิ่มซัพพลายเออร์รายแรก" action={!search ? { label:'เพิ่มซัพพลายเออร์', onClick: openAdd } : undefined} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>รหัส</th><th>ชื่อบริษัท/ร้าน</th><th>ผู้ติดต่อ</th><th>เบอร์โทร</th><th>สินค้า</th><th style={{ width:90 }}>จัดการ</th></tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td className="mono text-sm">{s.code}</td>
                  <td>
                    <div className="plant-name">{s.name}</div>
                    {s.email && <div className="plant-sci">{s.email}</div>}
                  </td>
                  <td>{s.contact ?? '—'}</td>
                  <td className="mono">{s.phone ?? '—'}</td>
                  <td><span className="badge badge--ok">{counts[s.id] ?? 0} รายการ</span></td>
                  <td>
                    <div className="row-actions">
                      {canWrite && <button className="icon-btn" onClick={() => openEdit(s)} title="แก้ไข"><I.Edit size={13} /></button>}
                      {canDelete && <button className="icon-btn danger" onClick={() => setDelItem(s)} title="ลบ"><I.Trash size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title={editItem ? 'แก้ไขซัพพลายเออร์' : 'เพิ่มซัพพลายเออร์'} onClose={() => setShowForm(false)} size="md">
          <form onSubmit={handleSave} className="form-grid">
            <Field label="รหัส" required error={errors.code}>
              <input value={form.code} onChange={e => setF('code',e.target.value)} placeholder="SUP001" disabled={!!editItem} />
            </Field>
            <Field label="ชื่อบริษัท/ร้าน" required error={errors.name}>
              <input value={form.name} onChange={e => setF('name',e.target.value)} placeholder="สวนป้าแดง" autoFocus />
            </Field>
            <Field label="ผู้ติดต่อ">
              <input value={form.contact} onChange={e => setF('contact',e.target.value)} placeholder="คุณแดง" />
            </Field>
            <Field label="เบอร์โทร">
              <input value={form.phone} onChange={e => setF('phone',e.target.value)} placeholder="081-234-5678" type="tel" />
            </Field>
            <Field label="อีเมล" error={errors.email} fullWidth>
              <input value={form.email} onChange={e => setF('email',e.target.value)} placeholder="supplier@email.com" type="email" />
            </Field>
            <Field label="หมายเหตุ" fullWidth>
              <textarea rows={2} value={form.note} onChange={e => setF('note',e.target.value)} placeholder="หมายเหตุ..." />
            </Field>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Spinner size={14} color="#fff" /> : editItem ? 'บันทึก' : 'เพิ่ม'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {delItem && (
        <Confirm title="ลบซัพพลายเออร์" danger
          desc={`ลบ "${delItem.name}"? ต้นไม้ที่ผูกกับซัพพลายเออร์นี้จะไม่ถูกลบ`}
          confirmLabel="ลบ" onConfirm={() => handleDelete(delItem)} onCancel={() => setDelItem(null)}
        />
      )}
    </div>
  )
}
