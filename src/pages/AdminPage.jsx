import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { userMessage } from '../lib/errors'
import Spinner from '../components/Spinner'

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
    const { error } = await supabase.from('profiles')
      .update({ role: editRole, name: editName.trim() || undefined, shop_name: editShop.trim() || null })
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

  if (!profile) return <div className="page-center"><Spinner size={32} /></div>
  if (profile.role !== 'admin') return <Navigate to="/" replace />

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-sub">{shops.length} บัญชีในระบบ</p>
        </div>
        <button className="btn btn-ghost" onClick={load}>รีเฟรช</button>
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
    </div>
  )
}
