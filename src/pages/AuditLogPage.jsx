import React, { useEffect, useState, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { userMessage } from '../lib/errors'
import { fmtDateTime } from '../lib/utils'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
const ACTION_LABEL = {
  'store.create':         'สร้างสาขา',
  'store.update':         'แก้ไขสาขา',
  'store.delete':         'ลบสาขา',
  'member.add':           'เพิ่มสมาชิก',
  'member.update':        'แก้ไขสมาชิก',
  'member.remove':        'ลบสมาชิก',
  'profile.role_change':  'เปลี่ยน Role',
  'settlement.reopen':    'เปิดยอดซ้ำ',
  'user.create':          'สร้างผู้ใช้',
  'user.delete':          'ลบผู้ใช้',
}

const ENTITY_LABEL = {
  store: 'สาขา', store_member: 'สมาชิก', profile: 'โปรไฟล์',
  settlement: 'ปิดยอด', user: 'ผู้ใช้',
}

const PAGE_SIZE = 100

export default function AuditLogPage() {
  const { profile, isSuperAdmin, stores } = useAuth()
  const { toast } = useToast()
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [hasMore, setHasMore]     = useState(false)
  const [storeFilter, setStoreFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [detail, setDetail]       = useState(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [storeFilter, actionFilter])

  async function load(append = false) {
    setLoading(true)
    let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(PAGE_SIZE + 1)
    if (storeFilter)  q = q.eq('store_id', storeFilter)
    if (actionFilter) q = q.like('action', `${actionFilter}%`)
    if (append && rows.length) q = q.lt('created_at', rows[rows.length - 1].created_at)
    const { data, error } = await q
    if (error) { toast.error(`โหลดไม่สำเร็จ: ${userMessage(error)}`); setLoading(false); return }
    const next = (data ?? []).slice(0, PAGE_SIZE)
    setRows(append ? [...rows, ...next] : next)
    setHasMore((data?.length ?? 0) > PAGE_SIZE)
    setLoading(false)
  }

  const storeMap = useMemo(() => Object.fromEntries(stores.map(s => [s.id, s])), [stores])

  if (!profile) return <div className="page-center"><Spinner size={32} /></div>
  // Anyone with at least one store_admin role (or super admin) sees logs
  const canView = isSuperAdmin || stores.some(s => s.role === 'store_admin')
  if (!canView) return <Navigate to="/" replace />

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-sub">{rows.length} รายการ {hasMore ? '(โหลดเพิ่ม)' : ''}</p>
        </div>
        <button className="btn btn-ghost" onClick={() => load(false)}>รีเฟรช</button>
      </div>

      <div className="filters">
        {isSuperAdmin && stores.length > 1 && (
          <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)}>
            <option value="">ทุกสาขา</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select>
        )}
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
          <option value="">ทุกการกระทำ</option>
          <option value="store.">สาขา</option>
          <option value="member.">สมาชิก</option>
          <option value="profile.">โปรไฟล์</option>
          <option value="settlement.">ปิดยอด</option>
          <option value="user.">ผู้ใช้</option>
        </select>
      </div>

      {loading && rows.length === 0 ? (
        <div className="page-center"><Spinner size={32} /></div>
      ) : rows.length === 0 ? (
        <EmptyState title="ยังไม่มี audit log" desc="การเปลี่ยนแปลงสำคัญในอนาคตจะถูกบันทึกที่นี่" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>เวลา</th>
                <th>ผู้กระทำ</th>
                <th>การกระทำ</th>
                <th>เป้าหมาย</th>
                <th>สาขา</th>
                <th></th>
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="text-sm mono">{fmtDateTime(r.created_at)}</td>
                    <td style={{ fontSize: 12 }}>{r.actor_email ?? (r.actor_id ? r.actor_id.slice(0,8) : 'system')}</td>
                    <td><span className="badge badge--info">{ACTION_LABEL[r.action] ?? r.action}</span></td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      <div>{ENTITY_LABEL[r.entity_type] ?? r.entity_type}</div>
                      {r.entity_id && <div style={{ color: 'var(--muted)' }}>{r.entity_id.slice(0,8)}…</div>}
                    </td>
                    <td>{r.store_id ? (storeMap[r.store_id]?.name ?? r.store_id.slice(0,8)) : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setDetail(r)}>
                        ดูรายละเอียด
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => load(true)} disabled={loading}>
                {loading ? <Spinner size={13} /> : 'โหลดเพิ่ม'}
              </button>
            </div>
          )}
        </>
      )}

      {detail && (
        <Modal title={`${ACTION_LABEL[detail.action] ?? detail.action} — ${fmtDateTime(detail.created_at)}`} onClose={() => setDetail(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 13, marginBottom: 14 }}>
            <strong>ผู้กระทำ:</strong>      <span>{detail.actor_email ?? detail.actor_id ?? '—'}</span>
            <strong>การกระทำ:</strong>      <span className="mono">{detail.action}</span>
            <strong>ประเภท:</strong>         <span>{ENTITY_LABEL[detail.entity_type] ?? detail.entity_type}</span>
            <strong>เป้าหมาย ID:</strong>   <span className="mono">{detail.entity_id ?? '—'}</span>
            <strong>สาขา:</strong>           <span>{detail.store_id ? (storeMap[detail.store_id]?.name ?? detail.store_id) : '—'}</span>
            <strong>เวลา:</strong>           <span className="mono">{detail.created_at}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>ข้อมูลเพิ่มเติม:</div>
          <pre style={{
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
            padding: 12, fontSize: 11, maxHeight: 400, overflow: 'auto', margin: 0,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {JSON.stringify(detail.metadata, null, 2)}
          </pre>
        </Modal>
      )}
    </div>
  )
}
