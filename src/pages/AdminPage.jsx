import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { userMessage } from '../lib/errors'
import Spinner from '../components/Spinner'
import Modal from '../components/Modal'

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'viewer', label: 'Viewer' },
]

export default function AdminPage() {
  const { profile, setAdminViewingOwnerId } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [shops, setShops] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editRole, setEditRole] = useState('')
  const [editName, setEditName] = useState('')
  const [editShop, setEditShop] = useState('')
  const [saving, setSaving] = useState(false)

  // Create user modal
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [newShop, setNewShop] = useState('')
  const [newRole, setNewRole] = useState('staff')

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, name, email }
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (profile?.role === 'admin') load()
  }, [profile])

  async function load() {
    setLoading(true)
    const { data } = await supabase.rpc('get_all_shops_for_admin')
    setShops(data ?? [])
    setLoading(false)
  }

  function startEdit(shop) {
    setEditingId(shop.id)
    setEditRole(shop.role ?? 'staff')
    setEditName(shop.name ?? '')
    setEditShop(shop.shop_name ?? '')
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(shopId) {
    setSaving(true)
    const payload = {
      role: editRole,
      shop_name: editShop.trim() || null,
    }
    if (editName.trim()) payload.name = editName.trim()
    const { error } = await supabase.from('profiles')
      .update(payload)
      .eq('id', shopId)
    setSaving(false)
    if (error) {
      toast.error(`บันทึกไม่สำเร็จ: ${userMessage(error)}`)
    } else {
      toast.success('บันทึกสำเร็จ')
      setEditingId(null)
      load()
    }
  }

  function viewShop(shopId) {
    setAdminViewingOwnerId(shopId)
    navigate('/stock')
  }

  function openCreate() {
    setNewEmail(''); setNewPassword(''); setNewName(''); setNewShop(''); setNewRole('staff')
    setShowCreate(true)
  }

  async function callFn(body) {
    const { data, error } = await supabase.functions.invoke('admin-manage-users', { body })
    if (error) {
      let msg = null
      try { const j = await error.context?.json(); msg = j?.error } catch {}
      return { fnError: msg ?? error.message ?? 'เกิดข้อผิดพลาด' }
    }
    if (data?.error) return { fnError: data.error }
    return { data }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newEmail.trim() || !newPassword.trim()) return
    setCreating(true)
    const { data, fnError } = await callFn({
      action: 'create', email: newEmail.trim(), password: newPassword,
      name: newName.trim(), shop_name: newShop.trim(), role: newRole,
    })
    setCreating(false)
    if (fnError) {
      toast.error(`สร้างไม่สำเร็จ: ${fnError}`)
    } else {
      toast.success(`สร้างผู้ใช้ ${newEmail} สำเร็จ`)
      setShowCreate(false)
      load()
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { fnError } = await callFn({ action: 'delete', userId: deleteTarget.id })
    setDeleting(false)
    if (fnError) {
      toast.error(`ลบไม่สำเร็จ: ${fnError}`)
    } else {
      toast.success(`ลบผู้ใช้ ${deleteTarget.email || deleteTarget.name} สำเร็จ`)
      setDeleteTarget(null)
      load()
    }
  }

  if (!profile) return <div className="page-center"><Spinner size={32} /></div>
  if (profile.role !== 'admin') return <Navigate to="/" replace />

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-sub">{shops.length} บัญชีในระบบ</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={load}>รีเฟรช</button>
          <button className="btn btn-primary" onClick={openCreate}>+ เพิ่มผู้ใช้</button>
        </div>
      </div>

      {loading ? (
        <div className="page-center"><Spinner size={32} /></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ผู้ใช้</th>
                <th>อีเมล</th>
                <th>ชื่อร้าน</th>
                <th>บทบาท</th>
                <th>ต้นไม้</th>
                <th>อัปเดต</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shops.map(s => (
                <React.Fragment key={s.id}>
                  <tr>
                    <td>
                      <div style={{ fontWeight: 500 }}>{s.name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                        {s.id.slice(0, 8)}…
                        {s.manager_id && <span style={{ marginLeft: 6, color: 'oklch(55% 0.18 250)' }}>↳ staff</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{s.email || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td>{s.shop_name || <span style={{ color: 'var(--muted)' }}>ยังไม่ตั้ง</span>}</td>
                    <td>
                      <span className={`badge ${s.role === 'admin' ? 'badge--info' : ''}`}>
                        {s.role === 'admin' ? 'Admin' : s.role === 'viewer' ? 'Viewer' : 'Staff'}
                      </span>
                    </td>
                    <td className="mono">{s.plant_count}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {s.updated_at ? new Date(s.updated_at).toLocaleDateString('th-TH') : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => viewShop(s.id)}>
                          ดูร้าน
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => startEdit(s)}>
                          แก้ไข
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '4px 10px', color: 'var(--danger, #dc2626)' }}
                          onClick={() => setDeleteTarget({ id: s.id, name: s.name, email: s.email })}
                          disabled={s.id === profile.id}
                          title={s.id === profile.id ? 'ไม่สามารถลบบัญชีตัวเองได้' : ''}
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>

                  {editingId === s.id && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--bg)', padding: '12px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto auto', gap: 8, alignItems: 'end' }}>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>ชื่อผู้ใช้</div>
                            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="ชื่อผู้ใช้" />
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>ชื่อร้าน</div>
                            <input value={editShop} onChange={e => setEditShop(e.target.value)} placeholder="ชื่อร้าน" />
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>บทบาท</div>
                            <select value={editRole} onChange={e => setEditRole(e.target.value)}>
                              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          </div>
                          <button className="btn btn-primary" style={{ padding: '6px 16px' }} onClick={() => saveEdit(s.id)} disabled={saving}>
                            {saving ? <Spinner size={13} color="#fff" /> : 'บันทึก'}
                          </button>
                          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={cancelEdit}>ยกเลิก</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 24, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>สถิติระบบ</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { label: 'บัญชีทั้งหมด', value: shops.length },
            { label: 'Admin', value: shops.filter(s => s.role === 'admin').length },
            { label: 'ต้นไม้รวม', value: shops.reduce((sum, s) => sum + Number(s.plant_count), 0) },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{value}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Create User Modal ───────────────────────────────── */}
      {showCreate && (
        <Modal title="เพิ่มผู้ใช้ใหม่" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>อีเมล *</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="user@example.com"
                required
                autoFocus
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>รหัสผ่าน *</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="อย่างน้อย 6 ตัวอักษร"
                minLength={6}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>ชื่อผู้ใช้</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="ชื่อ (ไม่บังคับ)"
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>ชื่อร้าน</label>
              <input
                value={newShop}
                onChange={e => setNewShop(e.target.value)}
                placeholder="ชื่อร้าน (ไม่บังคับ)"
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>บทบาท</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? <Spinner size={13} color="#fff" /> : 'สร้างบัญชี'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete Confirm Modal ────────────────────────────── */}
      {deleteTarget && (
        <Modal title="ยืนยันการลบ" onClose={() => setDeleteTarget(null)} size="sm">
          <p style={{ margin: '0 0 8px' }}>
            ลบบัญชี <strong>{deleteTarget.name || deleteTarget.email}</strong> ออกจากระบบ?
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 20px' }}>
            ข้อมูลทั้งหมดของบัญชีนี้ (ต้นไม้, ประวัติ, ฯลฯ) จะถูกลบถาวร
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>ยกเลิก</button>
            <button
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Spinner size={13} color="#fff" /> : 'ลบถาวร'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
