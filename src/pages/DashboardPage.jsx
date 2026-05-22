import React, { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { statusOf, fmtCurrency, fmtDateTime } from '../lib/utils'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from '../components/StatusBadge'
import Spinner from '../components/Spinner'
import * as I from '../components/Icons'

export default function DashboardPage() {
  const { symbol } = useCurrency()
  const { ownerId } = useAuth()
  const [plants, setPlants]    = useState([])
  const [moves, setMoves]      = useState([])
  const [loading, setLoading]  = useState(true)

  useEffect(() => {
    fetchAll()
    if (!ownerId) return
    const ch = supabase.channel(`dash-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plants',    filter: `owner_id=eq.${ownerId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movements', filter: `owner_id=eq.${ownerId}` }, fetchAll)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [ownerId])

  async function fetchAll() {
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from('plants').select('*,categories(name_th,hue)'),
      supabase.from('movements').select('*,plants(name,sku)').order('created_at', { ascending: false }).limit(10),
    ])
    setPlants(p ?? [])
    setMoves(m ?? [])
    setLoading(false)
  }

  const stats = useMemo(() => {
    const total      = plants.length
    const ok         = plants.filter(p => statusOf(p) === 'ok').length
    const low        = plants.filter(p => statusOf(p) === 'low').length
    const out        = plants.filter(p => statusOf(p) === 'out').length
    const totalStock = plants.reduce((s, p) => s + p.stock, 0)
    const totalValue = plants.reduce((s, p) => s + p.stock * p.price, 0)
    const alerts     = plants.filter(p => statusOf(p) !== 'ok').slice(0, 6)
    return { total, ok, low, out, totalStock, totalValue, alerts }
  }, [plants])

  if (loading) return <div className="page-center"><Spinner size={32} /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">แดชบอร์ด</h1>
          <p className="page-sub">ภาพรวมระบบสต็อก</p>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="สินค้าทั้งหมด" value={stats.total} unit="รายการ" icon={I.Box} color={140} />
        <StatCard label="สต็อกรวม"      value={stats.totalStock} unit="หน่วย"  icon={I.Package} color={170} />
        <StatCard label="มูลค่าสต็อก"   value={fmtCurrency(stats.totalValue)} unit={symbol} icon={I.Chart} color={220} />
        <StatCard label="สต็อกปกติ"     value={stats.ok} unit="รายการ"  icon={I.Check} color={140} />
        <StatCard label="ใกล้หมด"       value={stats.low} unit="รายการ" icon={I.Alert} color={60} alert={stats.low > 0} />
        <StatCard label="หมดสต็อก"      value={stats.out} unit="รายการ" icon={I.Warning} color={25} alert={stats.out > 0} />
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title"><I.Alert size={14} /> สินค้าที่ต้องดำเนินการ</h2>
            <Link to="/low" className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 8px' }}>ดูทั้งหมด</Link>
          </div>
          {stats.alerts.length === 0 ? (
            <div className="card-empty"><I.Check size={20} style={{ color: 'var(--accent)' }} /><span>สต็อกทุกรายการปกติ</span></div>
          ) : (
            <div className="alert-list">
              {stats.alerts.map(p => (
                <div key={p.id} className="alert-item">
                  <div>
                    <div className="alert-name">{p.name}</div>
                    <div className="alert-sku">{p.sku}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <StatusBadge status={statusOf(p)} />
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>เหลือ {p.stock} / ขั้นต่ำ {p.min_stock}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title"><I.History size={14} /> เคลื่อนไหวล่าสุด</h2>
            <Link to="/movements" className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 8px' }}>ดูทั้งหมด</Link>
          </div>
          {moves.length === 0 ? (
            <div className="card-empty"><I.History size={20} /><span>ยังไม่มีประวัติการเคลื่อนไหว</span></div>
          ) : (
            <div className="move-list">
              {moves.map(m => (
                <div key={m.id} className="move-item">
                  <span className={`move-badge move-badge--${m.type}`}>
                    {m.type === 'in' ? '+' : m.type === 'out' ? '−' : m.type === 'new' ? '★' : m.type === 'delete' ? '✕' : '≈'}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="move-name">{m.plants?.name ?? (m.type === 'delete' ? m.note : '—')}</div>
                    <div className="move-note">{
                      m.type === 'in' ? (m.note || 'รับเข้า') :
                      m.type === 'out' ? (m.note || 'จ่ายออก') :
                      m.type === 'new' ? 'เพิ่มสินค้าใหม่' :
                      m.type === 'delete' ? 'ลบสินค้า' :
                      m.type === 'rename' ? (m.note || 'เปลี่ยนชื่อ') :
                      (m.note || 'ปรับสต็อก')
                    }</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="move-qty">{m.qty > 0 ? `+${m.qty}` : m.qty}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtDateTime(m.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function StatCard({ label, value, unit, icon: Icon, color = 140, alert }) {
  return (
    <div className={`stat ${alert ? 'stat--alert' : ''}`}>
      <div className="stat-label">
        <span style={{ color: `oklch(50% 0.12 ${color})` }}><Icon size={14} /></span>
        <span>{label}</span>
      </div>
      <div className="stat-value">
        <span>{value}</span>
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
    </div>
  )
}
