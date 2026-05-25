import React, { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { userMessage } from '../lib/errors'
import Spinner from '../components/Spinner'
import Modal from '../components/Modal'
import Field from '../components/Field'
import * as I from '../components/Icons'

const STORE_ROLES = [
  { value: 'store_admin', label: 'Store Admin' },
  { value: 'staff',       label: 'Staff' },
  { value: 'viewer',      label: 'Viewer' },
]

const PERM_FLAGS = [
  { key: 'perm_sell',          label: 'ขายของ',          group: 'movement' },
  { key: 'perm_receive',       label: 'รับเข้า',         group: 'movement' },
  { key: 'perm_adjust',        label: 'ปรับสต็อก',       group: 'movement' },
  { key: 'perm_manage_plants', label: 'จัดการต้นไม้',     group: 'data' },
  { key: 'perm_view_reports',  label: 'ดูรายงาน',        group: 'data' },
  { key: 'perm_finance',       label: 'การเงิน',         group: 'data' },
  { key: 'perm_settle',        label: 'ปิดยอด',          group: 'data' },
]

const ALL_PERMS_TRUE = Object.fromEntries(PERM_FLAGS.map(p => [p.key, true]))
const STAFF_DEFAULT_PERMS = {
  perm_sell: true, perm_receive: true, perm_adjust: false,
  perm_manage_plants: false, perm_view_reports: true,
  perm_finance: false, perm_settle: false,
}
const VIEWER_PERMS = Object.fromEntries(PERM_FLAGS.map(p => [p.key, false]))

const EMPTY_STORE = {
  code: '', name: '', address: '', phone: '', tax_id: '',
  vat_rate: '0', vat_inclusive: true, currency: 'THB', active: true,
}

export default function AdminPage() {
  const { profile, isSuperAdmin, setCurrentStoreId } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [stores, setStores]           = useState([])
  const [memberMap, setMemberMap]     = useState({})       // store_id → members[]
  const [plantCount, setPlantCount]   = useState({})       // store_id → number
  const [emails, setEmails]           = useState({})       // user_id → email
  const [allUsers, setAllUsers]       = useState([])       // for picker
  const [loading, setLoading]         = useState(true)
  const [expandedId, setExpandedId]   = useState(null)

  const [showCreate, setShowCreate]   = useState(false)
  const [editingStore, setEditingStore] = useState(null)   // store row
  const [deletingStore, setDeletingStore] = useState(null)
  const [addingMemberFor, setAddingMemberFor] = useState(null)  // store_id
  const [editingMember, setEditingMember] = useState(null)      // { store_id, member }
  const [removingMember, setRemovingMember] = useState(null)    // { store_id, member }

  useEffect(() => { if (isSuperAdmin) load() }, [isSuperAdmin])

  async function load() {
    setLoading(true)
    try {
      const [sRes, mRes, pRes, uRes] = await Promise.all([
        supabase.from('stores').select('*').order('code'),
        supabase.from('store_members').select('*'),
        supabase.from('plants').select('store_id'),
        supabase.rpc('get_all_shops_for_admin'),
      ])
      if (sRes.error) throw sRes.error
      if (mRes.error) throw mRes.error
      if (pRes.error) throw pRes.error
      if (uRes.error) throw uRes.error
      setStores(sRes.data ?? [])

      const map = {}
      ;(mRes.data ?? []).forEach(m => {
        if (!map[m.store_id]) map[m.store_id] = []
        map[m.store_id].push(m)
      })
      setMemberMap(map)

      const counts = {}
      ;(pRes.data ?? []).forEach(p => { counts[p.store_id] = (counts[p.store_id] ?? 0) + 1 })
      setPlantCount(counts)

      const eMap = {}
      const users = (uRes.data ?? []).map(u => {
        if (u.email) eMap[u.id] = u.email
        return { id: u.id, name: u.name, email: u.email }
      })
      setEmails(eMap)
      setAllUsers(users)
    } catch (err) {
      toast.error(`โหลดไม่สำเร็จ: ${userMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }

  function viewStore(id) { setCurrentStoreId(id); navigate('/stock') }

  async function deleteStore(store) {
    const { error } = await supabase.from('stores').delete().eq('id', store.id)
    if (error) { toast.error(`ลบไม่สำเร็จ: ${userMessage(error)}`); return }
    toast.success(`ลบสาขา ${store.name} สำเร็จ`)
    setDeletingStore(null)
    load()
  }

  if (!profile) return <div className="page-center"><Spinner size={32} /></div>
  if (!isSuperAdmin) return <Navigate to="/" replace />

  if (loading) return <div className="page"><div className="page-header"><h1 className="page-title">Admin Panel</h1></div><div className="page-center"><Spinner size={32} /></div></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-sub">{stores.length} สาขา · {Object.values(memberMap).flat().length} สมาชิกรวม · {allUsers.length} บัญชี</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={load}>รีเฟรช</button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><I.Plus size={13} /> เพิ่มสาขา</button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 90 }}>รหัส</th>
              <th>ชื่อสาขา</th>
              <th>สมาชิก</th>
              <th>ต้นไม้</th>
              <th>สถานะ</th>
              <th>VAT</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stores.map(s => {
              const members = memberMap[s.id] ?? []
              return (
                <React.Fragment key={s.id}>
                  <tr>
                    <td className="mono">{s.code}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{s.name}</div>
                      {s.tax_id && <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{s.tax_id}</div>}
                    </td>
                    <td className="mono">{members.length}</td>
                    <td className="mono">{plantCount[s.id] ?? 0}</td>
                    <td><span className={`badge ${s.active ? 'badge--info' : ''}`}>{s.active ? 'ใช้งาน' : 'ปิด'}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {Number(s.vat_rate) > 0 ? `${s.vat_rate}% ${s.vat_inclusive ? 'รวม' : 'แยก'}` : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => viewStore(s.id)}>ดูร้าน</button>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                          {expandedId === s.id ? 'ซ่อน' : 'สมาชิก'}
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setEditingStore(s)}>แก้ไข</button>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: 'var(--danger, #dc2626)' }} onClick={() => setDeletingStore(s)}>ลบ</button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === s.id && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--bg)', padding: '12px 16px' }}>
                        <MembersPanel
                          store={s}
                          members={members}
                          emails={emails}
                          allUsers={allUsers}
                          onAdd={() => setAddingMemberFor(s.id)}
                          onEdit={(m) => setEditingMember({ store_id: s.id, member: m })}
                          onRemove={(m) => setRemovingMember({ store_id: s.id, member: m })}
                          isSelf={(uid) => uid === profile.id}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <StoreFormModal
          title="เพิ่มสาขาใหม่"
          initial={{ ...EMPTY_STORE, code: suggestCode(stores) }}
          submitLabel="สร้างสาขา"
          onClose={() => setShowCreate(false)}
          onSubmit={async (payload) => {
            const { error } = await supabase.from('stores').insert(payload)
            if (error) { toast.error(`สร้างไม่สำเร็จ: ${userMessage(error)}`); return false }
            toast.success(`สร้างสาขา ${payload.code} สำเร็จ`)
            setShowCreate(false); load()
            return true
          }}
        />
      )}

      {editingStore && (
        <StoreFormModal
          title={`แก้ไขสาขา: ${editingStore.code}`}
          initial={{
            code: editingStore.code,
            name: editingStore.name,
            address: editingStore.address ?? '',
            phone: editingStore.phone ?? '',
            tax_id: editingStore.tax_id ?? '',
            vat_rate: String(editingStore.vat_rate ?? 0),
            vat_inclusive: editingStore.vat_inclusive,
            currency: editingStore.currency,
            active: editingStore.active,
          }}
          submitLabel="บันทึก"
          onClose={() => setEditingStore(null)}
          onSubmit={async (payload) => {
            const { error } = await supabase.from('stores').update(payload).eq('id', editingStore.id)
            if (error) { toast.error(`บันทึกไม่สำเร็จ: ${userMessage(error)}`); return false }
            toast.success('บันทึกสาขาสำเร็จ')
            setEditingStore(null); load()
            return true
          }}
        />
      )}

      {deletingStore && (
        <Modal title="ยืนยันการลบสาขา" onClose={() => setDeletingStore(null)} size="sm">
          <p style={{ margin: '0 0 6px' }}>
            ลบสาขา <strong>{deletingStore.name}</strong> ({deletingStore.code})?
          </p>
          <p style={{ fontSize: 12, color: 'var(--danger, #dc2626)', margin: '0 0 16px' }}>
            ⚠ ข้อมูลทั้งหมดของสาขานี้ (ต้นไม้, movements, finance, settlement, members) จะถูกลบถาวร
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setDeletingStore(null)}>ยกเลิก</button>
            <button className="btn btn-danger" onClick={() => deleteStore(deletingStore)}>ลบถาวร</button>
          </div>
        </Modal>
      )}

      {addingMemberFor && (
        <AddMemberModal
          storeId={addingMemberFor}
          existingMemberUserIds={new Set((memberMap[addingMemberFor] ?? []).map(m => m.user_id))}
          allUsers={allUsers}
          onClose={() => setAddingMemberFor(null)}
          onDone={() => { setAddingMemberFor(null); load() }}
        />
      )}

      {editingMember && (
        <EditMemberModal
          storeId={editingMember.store_id}
          member={editingMember.member}
          userLabel={emails[editingMember.member.user_id] || editingMember.member.user_id.slice(0, 8)}
          onClose={() => setEditingMember(null)}
          onDone={() => { setEditingMember(null); load() }}
        />
      )}

      {removingMember && (
        <Modal title="ยืนยันการลบสมาชิก" onClose={() => setRemovingMember(null)} size="sm">
          <p>ลบ <strong>{emails[removingMember.member.user_id] || removingMember.member.user_id.slice(0, 8)}</strong> ออกจากสาขานี้?</p>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 16px' }}>บัญชี user จะไม่ถูกลบ — แค่ถอนสิทธิ์การเข้าถึงสาขาเท่านั้น</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setRemovingMember(null)}>ยกเลิก</button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                const { error } = await supabase.from('store_members').delete().eq('id', removingMember.member.id)
                if (error) { toast.error(`ลบไม่สำเร็จ: ${userMessage(error)}`); return }
                toast.success('ลบสมาชิกสำเร็จ')
                setRemovingMember(null); load()
              }}
            >ลบ</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function suggestCode(stores) {
  const nums = stores.map(s => Number((s.code || '').replace(/\D/g, ''))).filter(n => Number.isFinite(n))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return 'STR' + String(next).padStart(3, '0')
}

function MembersPanel({ store, members, emails, onAdd, onEdit, onRemove, isSelf }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>สมาชิกของ {store.name}</h3>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onAdd}>
          <I.Plus size={11} /> เพิ่มสมาชิก
        </button>
      </div>
      {members.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>ยังไม่มีสมาชิกในสาขานี้</p>
      ) : (
        <table style={{ width: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>ผู้ใช้</th>
              <th style={{ textAlign: 'left' }}>บทบาท</th>
              <th style={{ textAlign: 'left' }}>สิทธิ์</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id}>
                <td>
                  <div>{emails[m.user_id] || m.user_id.slice(0, 8)}</div>
                </td>
                <td><span className="badge badge--info">{STORE_ROLES.find(r => r.value === m.role)?.label ?? m.role}</span></td>
                <td>
                  <PermsSummary member={m} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 6px' }} onClick={() => onEdit(m)}>แก้</button>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: '3px 6px', color: 'var(--danger, #dc2626)' }}
                    onClick={() => onRemove(m)}
                    disabled={isSelf(m.user_id)}
                    title={isSelf(m.user_id) ? 'ลบบัญชีตัวเองไม่ได้' : ''}
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function PermsSummary({ member }) {
  const granted = PERM_FLAGS.filter(p => member[p.key]).map(p => p.label)
  if (granted.length === PERM_FLAGS.length) return <span style={{ color: 'var(--accent, #16a34a)' }}>ทั้งหมด</span>
  if (granted.length === 0) return <span style={{ color: 'var(--muted)' }}>ไม่มีสิทธิ์</span>
  return <span>{granted.join(', ')}</span>
}

function StoreFormModal({ title, initial, submitLabel, onClose, onSubmit }) {
  const [f, setF] = useState(initial)
  const [busy, setBusy] = useState(false)
  function set(k, v) { setF(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!f.code.trim() || !f.name.trim()) return
    const rate = Number(f.vat_rate)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return
    setBusy(true)
    const payload = {
      code: f.code.trim().toUpperCase(),
      name: f.name.trim(),
      address: f.address?.trim() || null,
      phone: f.phone?.trim() || null,
      tax_id: f.tax_id?.trim() || null,
      vat_rate: rate,
      vat_inclusive: !!f.vat_inclusive,
      currency: f.currency,
      active: !!f.active,
    }
    const ok = await onSubmit(payload)
    if (!ok) setBusy(false)
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="รหัสสาขา" required><input value={f.code} onChange={e => set('code', e.target.value)} placeholder="STR001" autoFocus /></Field>
        <Field label="ชื่อสาขา" required><input value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="ที่อยู่" hint="แสดงในใบเสร็จ"><input value={f.address} onChange={e => set('address', e.target.value)} /></Field>
        <Field label="เบอร์โทร"><input value={f.phone} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="เลขผู้เสียภาษี"><input value={f.tax_id} onChange={e => set('tax_id', e.target.value)} placeholder="0-0000-00000-00-0" /></Field>
        <Field label="สกุลเงิน">
          <select value={f.currency} onChange={e => set('currency', e.target.value)}>
            <option value="THB">บาท (THB)</option>
            <option value="LAK">กีบ (LAK)</option>
          </select>
        </Field>
        <Field label="อัตรา VAT (%)"><input type="number" step="0.01" min="0" max="100" value={f.vat_rate} onChange={e => set('vat_rate', e.target.value)} /></Field>
        <Field label="โหมด VAT">
          <select value={f.vat_inclusive ? '1' : '0'} onChange={e => set('vat_inclusive', e.target.value === '1')}>
            <option value="1">รวมในราคา (รีเทล)</option>
            <option value="0">แยกต่างหาก (B2B)</option>
          </select>
        </Field>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} />
            <span>เปิดใช้งานสาขานี้</span>
          </label>
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Spinner size={13} color="#fff" /> : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AddMemberModal({ storeId, existingMemberUserIds, allUsers, onClose, onDone }) {
  const { toast } = useToast()
  const [mode, setMode] = useState('existing')  // 'existing' | 'new'
  const [pickedUserId, setPickedUserId] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [role, setRole] = useState('staff')
  const [perms, setPerms] = useState(STAFF_DEFAULT_PERMS)
  const [busy, setBusy] = useState(false)

  const eligibleUsers = useMemo(
    () => allUsers.filter(u => !existingMemberUserIds.has(u.id)),
    [allUsers, existingMemberUserIds],
  )

  function applyRolePreset(r) {
    setRole(r)
    if (r === 'store_admin') setPerms(ALL_PERMS_TRUE)
    else if (r === 'viewer') setPerms(VIEWER_PERMS)
    else setPerms(STAFF_DEFAULT_PERMS)
  }

  async function callEdgeCreate() {
    const { data, error } = await supabase.functions.invoke('admin-manage-users', {
      body: { action: 'create', email: newEmail.trim(), password: newPassword, name: newName.trim() },
    })
    if (error) {
      let msg = null
      try { const j = await error.context?.json(); msg = j?.error } catch { /* ignore */ }
      throw new Error(msg ?? error.message ?? 'create failed')
    }
    if (data?.error) throw new Error(data.error)
    return data?.user?.id
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      let userId = pickedUserId
      if (mode === 'new') {
        if (!newEmail.trim() || !newPassword.trim()) { toast.error('กรอกอีเมลและรหัสผ่าน'); setBusy(false); return }
        userId = await callEdgeCreate()
      } else {
        if (!userId) { toast.error('เลือกผู้ใช้'); setBusy(false); return }
      }

      const { error: mErr } = await supabase.from('store_members').insert({
        store_id: storeId,
        user_id: userId,
        role,
        ...perms,
      })
      if (mErr) throw mErr
      toast.success('เพิ่มสมาชิกสำเร็จ')
      onDone()
    } catch (err) {
      toast.error(`เพิ่มไม่สำเร็จ: ${userMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="เพิ่มสมาชิกในสาขา" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button type="button" className={`btn ${mode === 'existing' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('existing')} style={{ flex: 1, justifyContent: 'center' }}>
          เลือกจาก user ที่มีอยู่
        </button>
        <button type="button" className={`btn ${mode === 'new' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('new')} style={{ flex: 1, justifyContent: 'center' }}>
          สร้าง user ใหม่
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mode === 'existing' ? (
          <Field label="ผู้ใช้" required>
            <select value={pickedUserId} onChange={e => setPickedUserId(e.target.value)}>
              <option value="">— เลือก —</option>
              {eligibleUsers.map(u => (
                <option key={u.id} value={u.id}>{u.email || u.name || u.id.slice(0, 8)}</option>
              ))}
            </select>
          </Field>
        ) : (
          <>
            <Field label="อีเมล" required><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" autoFocus /></Field>
            <Field label="รหัสผ่าน" required><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={6} /></Field>
            <Field label="ชื่อ"><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ชื่อ (ไม่บังคับ)" /></Field>
          </>
        )}

        <Field label="บทบาทในสาขา">
          <select value={role} onChange={e => applyRolePreset(e.target.value)}>
            {STORE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>

        <PermsCheckboxGrid perms={perms} setPerms={setPerms} disabled={role === 'viewer'} />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Spinner size={13} color="#fff" /> : 'เพิ่มสมาชิก'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EditMemberModal({ storeId, member, userLabel, onClose, onDone }) {
  const { toast } = useToast()
  const [role, setRole] = useState(member.role)
  const [perms, setPerms] = useState(() => Object.fromEntries(PERM_FLAGS.map(p => [p.key, member[p.key]])))
  const [busy, setBusy] = useState(false)

  function applyRolePreset(r) {
    setRole(r)
    if (r === 'store_admin') setPerms(ALL_PERMS_TRUE)
    else if (r === 'viewer') setPerms(VIEWER_PERMS)
  }

  async function handleSave(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('store_members').update({
      role,
      ...perms,
    }).eq('id', member.id)
    setBusy(false)
    if (error) { toast.error(`บันทึกไม่สำเร็จ: ${userMessage(error)}`); return }
    toast.success('บันทึกสำเร็จ')
    onDone()
  }

  return (
    <Modal title={`แก้ไขสมาชิก: ${userLabel}`} onClose={onClose}>
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="บทบาท">
          <select value={role} onChange={e => applyRolePreset(e.target.value)}>
            {STORE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <PermsCheckboxGrid perms={perms} setPerms={setPerms} disabled={role === 'viewer'} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Spinner size={13} color="#fff" /> : 'บันทึก'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PermsCheckboxGrid({ perms, setPerms, disabled }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>สิทธิ์ในสาขา</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        {PERM_FLAGS.map(p => (
          <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: disabled ? 0.5 : 1 }}>
            <input
              type="checkbox"
              checked={!!perms[p.key]}
              disabled={disabled}
              onChange={e => setPerms(prev => ({ ...prev, [p.key]: e.target.checked }))}
            />
            <span>{p.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
