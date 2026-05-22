import React, { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { statusOf, fmtCurrency, generateSKU, downloadCSV, statusLabel } from '../lib/utils'
import { userMessage } from '../lib/errors'
import { compressImage, storagePath, MAX_IMAGE_BYTES } from '../lib/image'
import { useCurrency } from '../contexts/CurrencyContext'
import Modal from '../components/Modal'
import Confirm from '../components/Confirm'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import StatusBadge from '../components/StatusBadge'
import StockBar from '../components/StockBar'
import Field from '../components/Field'
import * as I from '../components/Icons'

const EMPTY = { sku:'',name:'',name_sci:'',category_id:'',supplier_id:'',stock:0,min_stock:5,price:0,cost:'',note:'',image_url:'' }

export default function StockPage() {
  const { toast } = useToast()
  const { user, ownerId, profile } = useAuth()
  const canWrite  = !profile?.manager_id || ['admin', 'staff'].includes(profile?.role)
  const canDelete = !profile?.manager_id || profile?.role === 'admin'
  const { symbol } = useCurrency()
  const location = useLocation()

  const [plants, setPlants]       = useState([])
  const [cats, setCats]           = useState([])
  const [sups, setSups]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState(location.state?.search ?? '')
  const [catFilter, setCatFilter] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir]     = useState('asc')

  const [showForm, setShowForm]     = useState(false)
  const [editItem, setEditItem]     = useState(null)
  const [delItem, setDelItem]       = useState(null)
  const [adjItem, setAdjItem]       = useState(null)

  const [form, setForm]     = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const [adjForm, setAdjForm] = useState({ type:'in', qty:1, note:'' })
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50
  const [imgUploading, setImgUploading] = useState(false)

  useEffect(() => {
    load()
    if (!ownerId) return
    const ch = supabase.channel(`stock-page-${ownerId}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'plants', filter: `owner_id=eq.${ownerId}` }, loadPlants)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [ownerId])

  async function load() {
    setLoading(true)
    await Promise.all([loadPlants(), loadCats(), loadSups()])
    setLoading(false)
  }

  async function loadPlants() {
    const { data, error } = await supabase
      .from('plants')
      .select('*, categories(id,name_th,hue,code), suppliers(id,name,code)')
      .order('name')
    if (error) { toast.error('โหลดข้อมูลไม่สำเร็จ'); return }
    setPlants(data ?? [])
  }
  async function loadCats() {
    const { data } = await supabase.from('categories').select('*').order('name_th')
    setCats(data ?? [])
  }
  async function loadSups() {
    const { data } = await supabase.from('suppliers').select('*').order('name')
    setSups(data ?? [])
  }

  function validate(f) {
    const e = {}
    if (!f.name?.trim())        e.name = 'กรุณาระบุชื่อต้นไม้'
    if (!f.sku?.trim())         e.sku  = 'กรุณาระบุ SKU'
    if (isNaN(f.price) || Number(f.price) < 0)     e.price = 'ราคาไม่ถูกต้อง'
    if (isNaN(f.stock) || Number(f.stock) < 0)     e.stock = 'จำนวนสต็อกไม่ถูกต้อง'
    if (isNaN(f.min_stock) || Number(f.min_stock) < 0) e.min_stock = 'จำนวนขั้นต่ำไม่ถูกต้อง'
    return e
  }

  function openAdd() {
    setForm({ ...EMPTY, sku: generateSKU() })
    setErrors({})
    setEditItem(null)
    setShowForm(true)
  }

  function openEdit(p) {
    setForm({ sku:p.sku, name:p.name, name_sci:p.name_sci??'', category_id:p.category_id??'', supplier_id:p.supplier_id??'', stock:p.stock, min_stock:p.min_stock, price:p.price, cost:p.cost??'', note:p.note??'', image_url:p.image_url??'' })
    setErrors({})
    setEditItem(p)
    setShowForm(true)
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) { toast.error('รูปต้องไม่เกิน 3MB'); return }
    setImgUploading(true)
    try {
      const compressed = await compressImage(file)
      const path = `${ownerId}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('plant-images').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('plant-images').getPublicUrl(path)
      // Cleanup previous image if replaced
      const oldPath = storagePath(form.image_url)
      if (oldPath && oldPath !== path) {
        supabase.storage.from('plant-images').remove([oldPath]).catch(() => {})
      }
      setF('image_url', publicUrl)
    } catch (err) {
      toast.error(`อัปโหลดรูปไม่สำเร็จ: ${userMessage(err)}`)
    } finally {
      setImgUploading(false)
    }
  }

  function removeImage() {
    const oldPath = storagePath(form.image_url)
    if (oldPath) supabase.storage.from('plant-images').remove([oldPath]).catch(() => {})
    setF('image_url', '')
  }

  async function handleSave(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const payload = {
        sku: form.sku.trim(), name: form.name.trim(),
        name_sci: form.name_sci?.trim() || null,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        stock: Number(form.stock), min_stock: Number(form.min_stock),
        price: Number(form.price),
        cost: form.cost !== '' ? Number(form.cost) : null,
        note: form.note?.trim() || null,
        image_url: form.image_url?.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (editItem) {
        const { error } = await supabase.from('plants').update(payload).eq('id', editItem.id)
        if (error) throw error
        toast.success('แก้ไขข้อมูลสำเร็จ')
      } else {
        const { error } = await supabase.from('plants').insert({ ...payload, owner_id: ownerId })
        if (error) throw error
        toast.success('เพิ่มต้นไม้สำเร็จ')
      }
      setShowForm(false)
      loadPlants()
    } catch (err) {
      if (err.code === '23505') setErrors({ sku: 'SKU นี้มีอยู่แล้วในร้านของคุณ' })
      else toast.error(userMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p) {
    try {
      // Cleanup storage image first
      const path = storagePath(p.image_url)
      if (path) supabase.storage.from('plant-images').remove([path]).catch(() => {})
      const { error } = await supabase.from('plants').delete().eq('id', p.id)
      if (error) throw error
      toast.success('ลบต้นไม้สำเร็จ')
      loadPlants()
    } catch (err) {
      toast.error(userMessage(err))
    }
    setDelItem(null)
  }

  async function handleAdj(e) {
    e.preventDefault()
    if (!adjItem) return
    const qty = Number(adjForm.qty)
    if (!qty || qty < 0) { toast.error('กรุณาระบุจำนวนที่ถูกต้อง'); return }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('adjust_stock', {
        p_plant_id: adjItem.id,
        p_type:     adjForm.type,
        p_qty:      qty,
        p_note:     adjForm.note?.trim() || null,
      })
      if (error) throw error
      toast.success('ปรับสต็อกสำเร็จ')
      setAdjItem(null)
      loadPlants()
    } catch (err) {
      toast.error(userMessage(err))
    } finally {
      setSaving(false)
    }
  }

  function toggleSort(field) {
    setSortDir(d => sortField === field ? (d === 'asc' ? 'desc' : 'asc') : 'asc')
    setSortField(field)
  }

  const filtered = useMemo(() => {
    let list = [...plants]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.name_sci?.toLowerCase().includes(q))
    }
    if (catFilter) list = list.filter(p => p.category_id === catFilter)
    list.sort((a, b) => {
      const av = a[sortField] ?? '', bv = b[sortField] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'th')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [plants, search, catFilter, sortField, sortDir])

  useEffect(() => { setPage(0) }, [search, catFilter, sortField, sortDir])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleExport() {
    const rows = [
      ['SKU','ชื่อต้นไม้','ชื่อวิทยาศาสตร์','หมวดหมู่','สต็อก','ขั้นต่ำ','ราคา','ต้นทุน','สถานะ'],
      ...filtered.map(p => [p.sku, p.name, p.name_sci??'', p.categories?.name_th??'', p.stock, p.min_stock, p.price, p.cost??'', statusLabel(statusOf(p))])
    ]
    downloadCSV(rows, `stock-${new Date().toISOString().slice(0,10)}.csv`)
    toast.success('ส่งออก CSV สำเร็จ')
  }

  const SortIcon = ({ f }) => sortField === f
    ? (sortDir === 'asc' ? <I.ArrowU size={10} /> : <I.ArrowD size={10} />)
    : null

  if (loading) return <div className="page-center"><Spinner size={32} /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">รายการสต็อก</h1>
          <p className="page-sub">
            {filtered.length} รายการ
            {totalPages > 1 && ` · หน้า ${page + 1}/${totalPages}`}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={handleExport}><I.Download size={13} /> ส่งออก</button>
          {canWrite && <button className="btn btn-primary" onClick={openAdd}><I.Plus size={13} /> เพิ่มต้นไม้</button>}
        </div>
      </div>

      <div className="filters">
        <div className="search-wrap">
          <I.Search size={13} className="search-icon" />
          <input placeholder="ค้นหา SKU, ชื่อ…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={() => setSearch('')}><I.X size={12} /></button>}
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">ทุกหมวดหมู่</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name_th}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="ไม่พบรายการ" desc={search ? 'ลองเปลี่ยนคำค้นหา' : 'เริ่มเพิ่มต้นไม้รายการแรก'} action={!search ? { label:'เพิ่มต้นไม้', onClick: openAdd } : undefined} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th style={{ width: 44 }}></th>
              <th className="sortable" onClick={() => toggleSort('sku')}>SKU <SortIcon f="sku" /></th>
              <th className="sortable" onClick={() => toggleSort('name')}>ชื่อต้นไม้ <SortIcon f="name" /></th>
              <th>หมวดหมู่</th>
              <th className="sortable" onClick={() => toggleSort('stock')}>สต็อก <SortIcon f="stock" /></th>
              <th className="sortable" onClick={() => toggleSort('price')}>ราคา <SortIcon f="price" /></th>
              <th>สถานะ</th>
              <th style={{ width: 90 }}>จัดการ</th>
            </tr></thead>
            <tbody>
              {paged.map(p => (
                <tr key={p.id}>
                  <td>
                    {p.image_url
                      ? <img src={p.image_url} alt={p.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🌿</div>
                    }
                  </td>
                  <td className="mono text-sm">{p.sku}</td>
                  <td>
                    <div className="plant-name">{p.name}</div>
                    {p.name_sci && <div className="plant-sci">{p.name_sci}</div>}
                  </td>
                  <td>
                    {p.categories && (
                      <span className="badge" style={{ background:`oklch(95% 0.03 ${p.categories.hue})`, color:`oklch(35% 0.08 ${p.categories.hue})`, borderColor:'transparent' }}>
                        {p.categories.name_th}
                      </span>
                    )}
                  </td>
                  <td><StockBar plant={p} /></td>
                  <td className="mono">{fmtCurrency(p.price)} {symbol}</td>
                  <td><StatusBadge status={statusOf(p)} /></td>
                  <td>
                    <div className="row-actions">
                      {canWrite && <button className="icon-btn" title="ปรับสต็อก" onClick={() => { setAdjItem(p); setAdjForm({ type:'in',qty:1,note:'' }) }}><I.Adjust size={13} /></button>}
                      {canWrite && <button className="icon-btn" title="แก้ไข" onClick={() => openEdit(p)}><I.Edit size={13} /></button>}
                      {canDelete && <button className="icon-btn danger" title="ลบ" onClick={() => setDelItem(p)}><I.Trash size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← ก่อนหน้า</button>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{page + 1} / {totalPages}</span>
          <button className="btn btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>ถัดไป →</button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <Modal title={editItem ? 'แก้ไขต้นไม้' : 'เพิ่มต้นไม้ใหม่'} onClose={() => setShowForm(false)} size="lg">
          <form onSubmit={handleSave} className="form-grid">
            <Field label="SKU" required error={errors.sku}>
              <input value={form.sku} onChange={e => setF('sku', e.target.value)} placeholder="PLT001" />
            </Field>
            <Field label="ชื่อต้นไม้" required error={errors.name}>
              <input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="กุหลาบ" autoFocus />
            </Field>
            <Field label="ชื่อวิทยาศาสตร์">
              <input value={form.name_sci} onChange={e => setF('name_sci', e.target.value)} placeholder="Rosa" />
            </Field>
            <Field label="หมวดหมู่">
              <select value={form.category_id} onChange={e => setF('category_id', e.target.value)}>
                <option value="">— เลือก —</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name_th}</option>)}
              </select>
            </Field>
            <Field label="ซัพพลายเออร์">
              <select value={form.supplier_id} onChange={e => setF('supplier_id', e.target.value)}>
                <option value="">— เลือก —</option>
                {sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="สต็อกปัจจุบัน" required error={errors.stock}>
              <input type="number" min="0" value={form.stock} onChange={e => setF('stock', e.target.value)} />
            </Field>
            <Field label="สต็อกขั้นต่ำ" required error={errors.min_stock}>
              <input type="number" min="0" value={form.min_stock} onChange={e => setF('min_stock', e.target.value)} />
            </Field>
            <Field label={`ราคาขาย (${symbol})`} required error={errors.price}>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => setF('price', e.target.value)} />
            </Field>
            <Field label={`ต้นทุน (${symbol})`}>
              <input type="number" min="0" step="0.01" value={form.cost} onChange={e => setF('cost', e.target.value)} placeholder="ไม่บังคับ" />
            </Field>
            <Field label="หมายเหตุ" fullWidth>
              <textarea rows={2} value={form.note} onChange={e => setF('note', e.target.value)} placeholder="หมายเหตุ..." />
            </Field>
            <Field label="รูปภาพ" fullWidth>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {form.image_url && (
                  <img src={form.image_url} alt="preview" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '7px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
                    {imgUploading ? <Spinner size={13} /> : '📷 เลือกรูป'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={imgUploading} />
                  </label>
                  {form.image_url && (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', marginLeft: 8, color: 'var(--muted)' }}
                      onClick={removeImage}>ลบรูป</button>
                  )}
                </div>
              </div>
            </Field>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Spinner size={14} color="#fff" /> : editItem ? 'บันทึก' : 'เพิ่มต้นไม้'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Adjust Stock Modal */}
      {adjItem && (
        <Modal title={`ปรับสต็อก: ${adjItem.name}`} onClose={() => setAdjItem(null)} size="sm">
          <form onSubmit={handleAdj} className="form-stack">
            <div className="current-stock-info">
              สต็อกปัจจุบัน: <strong>{adjItem.stock}</strong> หน่วย
            </div>
            <Field label="ประเภท">
              <div className="radio-group">
                {[['in','📦 รับเข้า'],['out','📤 จ่ายออก'],['adjust','⚖️ ปรับตั้งค่าใหม่']].map(([v,l]) => (
                  <label key={v} className={`radio-label ${adjForm.type === v ? 'active' : ''}`}>
                    <input type="radio" value={v} checked={adjForm.type===v} onChange={() => setAdjForm(f=>({...f,type:v}))} />
                    {l}
                  </label>
                ))}
              </div>
            </Field>
            <Field label={adjForm.type==='adjust' ? 'สต็อกใหม่ (จำนวนจริง)' : 'จำนวน'} required>
              <input type="number" min="0" value={adjForm.qty} onChange={e => setAdjForm(f=>({...f,qty:e.target.value}))} autoFocus />
            </Field>
            <Field label="หมายเหตุ">
              <input value={adjForm.note} onChange={e => setAdjForm(f=>({...f,note:e.target.value}))} placeholder="เหตุผลการปรับ..." />
            </Field>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setAdjItem(null)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Spinner size={14} color="#fff" /> : 'ยืนยัน'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm */}
      {delItem && (
        <Confirm title="ลบต้นไม้" danger
          desc={`ลบ "${delItem.name}" (${delItem.sku}) จะลบประวัติเคลื่อนไหวทั้งหมดด้วย — ไม่สามารถย้อนกลับได้`}
          confirmLabel="ลบ" onConfirm={() => handleDelete(delItem)} onCancel={() => setDelItem(null)}
        />
      )}
    </div>
  )
}
