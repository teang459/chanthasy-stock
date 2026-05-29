import React, { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { statusOf, fmtCurrency, fmtDateTime } from '../lib/utils'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../i18n'
import StatusBadge from '../components/StatusBadge'
import { SkeletonStats, SkeletonBox } from '../components/Skeleton'
import * as I from '../components/Icons'

export default function DashboardPage() {
  const { symbol } = useCurrency()
  const { ownerId } = useAuth()
  const t = useT()
  const [plants, setPlants]      = useState([])
  const [moves, setMoves]        = useState([])
  const [loading, setLoading]    = useState(true)
  const [settlementClosed, setSettlementClosed] = useState(null)

  useEffect(() => {
    fetchAll()
    if (!ownerId) return
    const ch = supabase.channel(`dash-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plants',    filter: `store_id=eq.${ownerId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movements', filter: `store_id=eq.${ownerId}` }, fetchAll)
      .subscribe()
    return () => supabase.removeChannel(ch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId])

  async function fetchAll() {
    if (!ownerId) return
    const today = new Date().toISOString().split('T')[0]
    const [{ data: p }, { data: m }, { data: settlement }] = await Promise.all([
      supabase.from('plants').select('*,categories(name_th,hue)').eq('store_id', ownerId),
      supabase.from('movements').select('*,plants(name,sku)').eq('store_id', ownerId).order('created_at', { ascending: false }).limit(10),
      supabase.from('daily_settlements').select('closed_at').eq('store_id', ownerId).eq('business_date', today).single(),
    ])
    setPlants(p ?? [])
    setMoves(m ?? [])
    setSettlementClosed(settlement?.closed_at !== null && settlement?.closed_at !== undefined)
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

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">{t('dashboard.page_title')}</h1>
            <p className="page-sub">{t('common.loading')}</p>
          </div>
        </div>
        <SkeletonStats count={4} />
        <div className="dash-grid" style={{ marginTop: 24 }}>
          <section className="card" style={{ padding: 16 }}>
            <SkeletonBox height={20} width="40%" style={{ marginBottom: 16 }} />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                <SkeletonBox width="60%" height={14} />
                <SkeletonBox width={60} height={20} />
              </div>
            ))}
          </section>
          <section className="card" style={{ padding: 16 }}>
            <SkeletonBox height={20} width="40%" style={{ marginBottom: 16 }} />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', alignItems: 'center' }}>
                <SkeletonBox width={24} height={24} radius={12} />
                <SkeletonBox width="70%" height={14} />
              </div>
            ))}
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('dashboard.page_title')}</h1>
          <p className="page-sub">{t('dashboard.page_sub')}</p>
        </div>
      </div>

      {(stats.low > 0 || stats.out > 0) && (
        <div className="dash-alert-banner">
          <I.Alert size={16} />
          <span>{t('dashboard.alert_banner_prefix')} <strong>{stats.low + stats.out}</strong> {t('dashboard.alert_banner_suffix')}</span>
          <Link to="/low" className="dash-alert-link">{t('dashboard.alert_banner_view_all')} →</Link>
        </div>
      )}

      <div className="stats-grid">
        <StatCard label={t('dashboard.stats_total')} value={stats.total} unit={t('common.items')} icon={I.Box} color={140} />
        <StatCard label={t('dashboard.stats_value')} value={fmtCurrency(stats.totalValue)} unit={symbol} icon={I.Chart} color={220} />
        <StatCard label={t('dashboard.stats_low')} value={stats.low} unit={t('common.items')} icon={I.Alert} color={60} alert={stats.low > 0} />
        <StatCard label={t('dashboard.stats_out')} value={stats.out} unit={t('common.items')} icon={I.Warning} color={25} alert={stats.out > 0} />
      </div>

      <div className="dash-quick-actions">
        <QuickAction icon={I.Box}     label={t('dashboard.action_adjust_stock')} to="/stock" />
        <QuickAction
          icon={I.Wallet}
          label={settlementClosed ? t('dashboard.action_close_settlement') : t('dashboard.action_open_settlement')}
          to="/settlement"
        />
        <QuickAction icon={I.Truck}   label={t('dashboard.action_purchase_order')} to="/purchase-orders" />
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title"><I.Alert size={14} /> {t('dashboard.alerts_title')}</h2>
            <Link to="/low" className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 8px' }}>{t('common.all')}</Link>
          </div>
          {stats.alerts.length === 0 ? (
            <div className="card-empty"><I.Check size={20} style={{ color: 'var(--accent)' }} /><span>{t('dashboard.alerts_empty')}</span></div>
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
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{t('common.items')}: {p.stock} / {t('common.min')}: {p.min_stock}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title"><I.History size={14} /> {t('dashboard.movements_title')}</h2>
            <Link to="/movements" className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 8px' }}>{t('common.all')}</Link>
          </div>
          {moves.length === 0 ? (
            <div className="card-empty"><I.History size={20} /><span>{t('dashboard.movements_empty')}</span></div>
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

function QuickAction({ icon: Icon, label, to }) {
  return (
    <Link to={to} className="dash-qa-btn">
      <Icon size={24} />
      <span>{label}</span>
    </Link>
  )
}
