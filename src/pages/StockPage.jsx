import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { statusOf, fmtCurrency, generateSKU, downloadCSV, statusLabel } from '../lib/utils'
import { userMessage } from '../lib/errors'
import { compressImage, storagePath, MAX_IMAGE_BYTES } from '../lib/image'
import { usePagination } from '../lib/usePagination'
import { useCurrency } from '../contexts/CurrencyContext'
import { useT } from '../i18n'
import Modal from '../components/Modal'
import Confirm from '../components/Confirm'
import Spinner from '../components/Spinner'
import { SkeletonBox } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import StatusBadge from '../components/StatusBadge'
import StockBar from '../components/StockBar'
import Field from '../components/Field'
import * as I from '../components/Icons'

const EMPTY = { sku:'',name:'',name_sci:'',category_id:'',supplier_id:'',stock:0,min_stock:5,price:0,cost:'',note:'',image_url:'' }

// Lazy-load so html5-qrcode is only fetched when a user opens the scanner.
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner'))
const BulkImport     = lazy(() => import('../components/BulkImport'))

export default function StockPage() {
  const { toast } = useToast()
  const { user, ownerId, perms } = useAuth()
  const t = useT()
  // perm_manage_plants gates plant CRUD; adjust/sell/receive flags gate the stock-adjust modal.
  const canWrite  = perms.perm_manage_plants
  const canDelete = perms.perm_manage_plants
  const canAdjust = perms.perm_sell || perms.perm_receive || perms.perm_adjust
  const { symbol } = useCurrency()
  const location = useLocation()

  const [plants, setPlants]       = useState([])
  const [cats, setCats]           = useState([])
  const [sups, setSups]           = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState(location.state?.search ?? '')
  const [catFilter, setCatFilter] = useState('')

  const [showForm, setShowForm]     = useState(false)
  const [editItem, setEditItem]     = useState(null)
  const [delItem, setDelItem]       = useState(null)
  const [adjItem, setAdjItem]       = useState(null)

  const [form, setForm]     = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const [adjForm, setAdjForm] = useState({ type:'in', qty:1, note:'', payment:'cash', customer_id:'' })
  const PAGE_SIZE = 50
  const [imgUploading, setImgUploading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [showImport, setShowImport]   = useState(false)

  useEffect(() => {
    if (!ownerId) return
    load()
    const ch = supabase.channel(`stock-page-${ownerId}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'plants', filter: `store_id=eq.${ownerId}` }, loadPlants)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [ownerId])

  async function load() {
    setLoading(true)
    await Promise.all([loadPlants(), loadCats(), loadSups(), loadCustomers()])
    setLoading(false)
  }

  async function loadCustomers() {
    if (!ownerId) return
    const { data } = await supabase.from('customers').select('id,name,code').eq('store_id', ownerId).eq('active', true).order('name')
    setCustomers(data ?? [])
  }

  async function loadPlants() {
    if (!ownerId) return
    const { data, error } = await supabase
      .from('plants')
      .select('*, categories(id,name_th,hue,code), suppliers(id,name,code)')
      .eq('store_id', ownerId)
      .order('name')
    if (error) { toast.error(`โหลดข้อมูลไม่สำเร็จ: ${userMessage(error)}`); return }
    setPlants(data ?? [])
  }
  async function loadCats() {
    if (!ownerId) return
    const { data } = await supabase.from('categories').select('*').eq('store_id', ownerId).order('name_th')
    setCats(data ?? [])
  }
  async function loadSups() {
    if (!ownerId) return
    const { data } = await supabase.from('suppliers').select('*').eq('store_id', ownerId).order('name')
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
        supabase.storage.from('plant-images').remove([oldPath])
          .catch(err => console.error('[storage cleanup] replace', oldPath, err))
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
    if (oldPath) {
      supabase.storage.from('plant-images').remove([oldPath])
        .catch(err => console.error('[storage cleanup] removeImage', oldPath, err))
    }
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
        const { error } = await supabase.from('plants').insert({ ...payload, store_id: ownerId })
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
      if (path) {
        supabase.storage.from('plant-images').remove([path])
          .catch(err => console.error('[storage cleanup] handleDelete', path, err))
      }
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
        p_payment:  adjForm.type === 'out' ? adjForm.payment : null,
        p_customer: adjForm.type === 'out' && adjForm.customer_id ? adjForm.customer_id : null,
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

  const filtered = useMemo(() => {
    let list = plants
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.name_sci?.toLowerCase().includes(q))
    }
    if (catFilter) list = list.filter(p => p.category_id === catFilter)
    return [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'))
  }, [plants, search, catFilter])

  // 1-based throughout the page (matches usePagination + display). The
  // old code carried a 0-based index just for slice math.
  const { paginated: paged, page, setPage, totalPages } = usePagination(filtered, PAGE_SIZE)

  function handleExport() {
    const rows = [
      ['SKU','ชื่อต้นไม้','ชื่อวิทยาศาสตร์','หมวดหมู่','สต็อก','ขั้นต่ำ','ราคา','ต้นทุน','สถานะ'],
      ...filtered.map(p => [p.sku, p.name, p.name_sci??'', p.categories?.name_th??'', p.stock, p.min_stock, p.price, p.cost??'', statusLabel(statusOf(p))])
    ]
    downloadCSV(rows, `stock-${new Date().toISOString().slice(0,10)}.csv`)
    toast.success('ส่งออก CSV สำเร็จ')
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">{t('stock.page_title')}</h1>
            <p className="page-sub">{t('common.loading')}</p>
          </div>
        </div>
        <div className="plant-grid">
          {Array.from({length: 8}, (_, i) => (
            <div key={i} className="plant-card-skeleton">
              <SkeletonBox height={160} />
              <div style={{padding:14, display:'flex', flexDirection:'column', gap:8}}>
                <SkeletonBox height={14} width="70%" />
                <SkeletonBox height={11} width="50%" />
                <SkeletonBox height={11} width="30%" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('stock.page_title')}</h1>
          <p className="page-sub">
            {filtered.length} {t('common.items')}
            {totalPages > 1 && ` · ${page}/${totalPages}`}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={handleExport}><I.Download size={13} /> {t('common.export')}</button>
          {canWrite && <button className="btn btn-ghost" onClick={() => setShowImport(true)}><I.Upload size={13} /> {t('stock.import_csv')}</button>}
          {canWrite && <button className="btn btn-primary" onClick={openAdd}><I.Plus size={13} /> {t('stock.add_plant')}</button>}
        </div>
      </div>

      <div className="filters">
        <div className="search-wrap">
          <I.Search size={13} className="search-icon" />
          <input placeholder={t('stock.search_placeholder')} value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={() => setSearch('')}><I.X size={12} /></button>}
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setShowScanner(true)}
          aria-label={t('stock.scan')}
          title={t('stock.scan')}
        >
          <I.QrCode size={14} /> {t('stock.scan')}
        </button>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">{t('stock.cat_all')}</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name_th}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t('stock.empty_title')} desc={search ? t('stock.empty_desc_search') : t('stock.empty_desc_first')} action={!search ? { label: t('stock.add_plant'), onClick: openAdd } : undefined} />
      ) : (
        <div className="plant-grid">
          {paged.map(p => {
            const status = statusOf(p)
            return (
              <div key={p.id} className={`plant-card${status !== 'ok' ? ` plant-card--${status}` : ''}`}>
                {p.image_url
                  ? <img className="plant-card__img" src={p.image_url} alt={p.name} />
                  : <div className="plant-card__img-ph">🌿</div>
                }
                <div className="plant-card__body">
                  <div className="plant-card__name">{p.name}</div>
                  {p.name_sci && <div className="plant-card__sci">{p.name_sci}</div>}
                  <div className="plant-card__sku">{p.sku}</div>
                  <div className="plant-card__meta">
                    <span className="plant-card__price">{fmtCurrency(p.price)} {symbol}</span>
                    <StatusBadge status={status} />
                  </div>
                </div>
                <div className="plant-card__stock">
                  <StockBar plant={p} />
                </div>
                <div className="plant-card__footer">
                  {p.categories ? (
                    <span className="badge" style={{
                      background:`oklch(95% 0.03 ${p.categories.hue})`,
                      color:`oklch(35% 0.08 ${p.categories.hue})`,
                      borderColor:'transparent', fontSize:10
                    }}>{p.categories.name_th}</span>
                  ) : <span />}
                  <div className="plant-card__actions">
                    {canAdjust && (
                      <button className="icon-btn" title={t('common.adjust')}
                        onClick={() => { setAdjItem(p); setAdjForm({type:'in',qty:1,note:'',payment:'cash',customer_id:''}) }}>
                        <I.Adjust size={13}/>
                      </button>
                    )}
                    {canWrite && (
                      <button className="icon-btn" title={t('common.edit')} onClick={() => openEdit(p)}>
                        <I.Edit size={13}/>
                      </button>
                    )}
                    {canDelete && (
                      <button className="icon-btn danger" title={t('common.delete')} onClick={() => setDelItem(p)}>
                        <I.Trash size={13}/>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← {t('common.back')}</button>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{page} / {totalPages}</span>
          <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('common.next')} →</button>
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
            {adjForm.type === 'out' && (
              <>
                <Field label="ช่องทางการชำระ">
                  <select value={adjForm.payment} onChange={e => setAdjForm(f=>({...f,payment:e.target.value}))}>
                    <option value="cash">เงินสด</option>
                    <option value="transfer">โอนเงิน</option>
                    <option value="credit">เครดิต / ค้างชำระ</option>
                    <option value="other">อื่นๆ</option>
                  </select>
                </Field>
                <Field label="ลูกค้า" hint="ไม่บังคับ — เลือกถ้าเป็นลูกค้าประจำ">
                  <select value={adjForm.customer_id} onChange={e => setAdjForm(f=>({...f,customer_id:e.target.value}))}>
                    <option value="">— ลูกค้าทั่วไป —</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.code ? `[${c.code}] ${c.name}` : c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
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

      {/* Bulk CSV Import */}
      {showImport && (
        <Suspense fallback={null}>
          <BulkImport
            onClose={() => setShowImport(false)}
            onDone={loadPlants}
            categories={cats}
            suppliers={sups}
          />
        </Suspense>
      )}

      {/* Barcode / QR Scanner */}
      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner
            onClose={() => setShowScanner(false)}
            onDetected={code => {
              setShowScanner(false)
              const trimmed = (code ?? '').trim()
              if (!trimmed) return
              setSearch(trimmed)
              setPage(1)
              const hit = plants.find(p => p.sku?.toLowerCase() === trimmed.toLowerCase())
              if (hit) toast.success(`พบ: ${hit.name} (${hit.sku})`)
              else toast.info(`ไม่พบ SKU "${trimmed}" — แสดงผลค้นหา`)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
