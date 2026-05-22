import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import Confirm from '../components/Confirm'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import Field from '../components/Field'
import * as I from '../components/Icons'

const EMPTY = { code:'', name_th:'', hue:140 }
const HUES = [
  { label:'เขียว',   hue: 140 },
  { label:'ฟ้า',     hue: 220 },
  { label:'ม่วง',    hue: 290 },
  { label:'ชมพู',    hue: 340 },
  { label:'แดง',     hue: 25  },
  { label:'ส้ม',     hue: 50  },
  { label:'เหลือง',  hue: 70  },
  { label:'เขียวน้ำ',hue: 170 },
]

export default function CategoriesPage() {
  const { toast } = useToast()
  const [cats, setCats]         = useState([])
  const [counts, setCounts]     = useState({})
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [delItem, setDelItem]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [errors, setErrors]     = useState({})
  const [saving, setSaving]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('categories').select('*').order('name_th'),
      supabase.from('plants').select('category_id'),
    ])
    setCats(c ?? [])
    const cnt = {}
    ;(p ?? []).forEach(pl => { cnt[pl.category_id] = (cnt[pl.category_id] ?? 0) + 1 })
    setCounts(cnt)
    setLoading(false)
  }

  function validate(f) {
    const e = {}
    if (!f.code?.trim())    e.code    = 'กรุณาระบุรหัส'
    if (!f.name_th?.trim()) e.name_th = 'กรุณาระบุชื่อ'
    return e
  }

  function openAdd() { setForm(EMPTY); setErrors({}); setEditItem(null); setShowForm(true) }
  function openEdit(c) { setForm({ code:c.code, name_th:c.name_th, hue:c.hue }); setErrors({}); setEditItem(c); setShowForm(true) }
  function setF(k,v) { setForm(f => ({...f,[k]:v})) }

  async function handleSave(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const payload = { code: form.code.trim().toLowerCase(), name_th: form.name_th.trim(), hue: Number(form.hue) }
      if (editItem) {
        const { error } = await supabase.from('categories').update(payload).eq('id', editItem.id)
        if (error) throw error
        toast.success('แก้ไขหมวดหมู่สำเร็จ')
      } else {
        const { error } = await supabase.from('categories').insert(payload)
        if (error) throw error
        toast.success('เพิ่มหมวดหมู่สำเร็จ')
      }
      setShowForm(false)
      load()
    } catch (err) {
      if (err.code === '23505') setErrors({ code: 'รหัสนี้มีอยู่แล้ว' })
      else toast.error(`เกิดข้อผิดพลาด: ${err.message}`)
    } finally { setSaving(false) }
  }

  async function handleDelete(c) {
    try {
      const { error } = await supabase.from('categories').delete().eq('id', c.id)
      if (error) throw error
      toast.success('ลบหมวดหมู่สำเร็จ')
      load()
    } catch (err) {
      toast.error(`ลบไม่สำเร็จ: ${err.message}`)
    }
    setDelItem(null)
  }

  if (loading) return <div className="page-center"><Spinner size={32} /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">หมวดหมู่</h1>
          <p className="page-sub">{cats.length} หมวดหมู่</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><I.Plus size={13} /> เพิ่มหมวดหมู่</button>
      </div>

      {cats.length === 0 ? (
        <EmptyState title="ยังไม่มีหมวดหมู่" desc="เริ่มสร้างหมวดหมู่แรก" action={{ label:'เพิ่มหมวดหมู่', onClick: openAdd }} />
      ) : (
        <div className="cat-grid">
          {cats.map(c => (
            <div key={c.id} className="cat-card" style={{ borderColor: `oklch(85% 0.06 ${c.hue})`, background: `oklch(97% 0.02 ${c.hue})` }}>
              <div className="cat-swatch" style={{ background: `oklch(75% 0.12 ${c.hue})` }} />
              <div className="cat-body">
                <div className="cat-name" style={{ color: `oklch(35% 0.08 ${c.hue})` }}>{c.name_th}</div>
                <div className="cat-code">{c.code} · {counts[c.id] ?? 0} รายการ</div>
              </div>
              <div className="cat-actions">
                <button className="icon-btn" onClick={() => openEdit(c)} title="แก้ไข"><I.Edit size={13} /></button>
                <button className="icon-btn danger" onClick={() => setDelItem(c)} title="ลบ"><I.Trash size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editItem ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'} onClose={() => setShowForm(false)} size="sm">
          <form onSubmit={handleSave} className="form-stack">
            <Field label="รหัส (code)" required error={errors.code} hint="ตัวอักษรภาษาอังกฤษ ไม่มีช่องว่าง">
              <input value={form.code} onChange={e => setF('code', e.target.value)} placeholder="flower" disabled={!!editItem} />
            </Field>
            <Field label="ชื่อหมวดหมู่" required error={errors.name_th}>
              <input value={form.name_th} onChange={e => setF('name_th', e.target.value)} placeholder="ไม้ดอก" autoFocus />
            </Field>
            <Field label="สี">
              <div className="hue-grid">
                {HUES.map(h => (
                  <button key={h.hue} type="button" className={`hue-btn ${form.hue === h.hue ? 'active' : ''}`}
                    style={{ background: `oklch(75% 0.12 ${h.hue})` }}
                    onClick={() => setF('hue', h.hue)} title={h.label} />
                ))}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
                Hue: <input type="number" value={form.hue} onChange={e => setF('hue', Number(e.target.value))} style={{ width: 60, display:'inline', padding:'2px 6px' }} min="0" max="360" />
              </div>
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
        <Confirm title="ลบหมวดหมู่" danger
          desc={`ลบ "${delItem.name_th}"? ต้นไม้ในหมวดหมู่นี้จะไม่ถูกลบ แต่จะไม่มีหมวดหมู่`}
          confirmLabel="ลบ" onConfirm={() => handleDelete(delItem)} onCancel={() => setDelItem(null)}
        />
      )}
    </div>
  )
}
