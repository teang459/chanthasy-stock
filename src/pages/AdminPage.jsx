import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Spinner from '../components/Spinner'

export default function AdminPage() {
  const { profile } = useAuth()
  const [shops, setShops] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.role === 'admin') load()
  }, [profile])

  async function load() {
    setLoading(true)
    const { data } = await supabase.rpc('get_all_shops_for_admin')
    setShops(data ?? [])
    setLoading(false)
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
                <th>ชื่อผู้ใช้</th>
                <th>ชื่อร้าน</th>
                <th>บทบาท</th>
                <th>ต้นไม้</th>
                <th>อัปเดตล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {shops.map(s => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{s.name || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{s.id.slice(0, 8)}…</div>
                  </td>
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
                </tr>
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
