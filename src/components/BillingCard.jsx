import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { tierOf, usageRatios, fmtTHB } from '../lib/billing'
import { userMessage } from '../lib/errors'
import Spinner from './Spinner'
import * as I from './Icons'

const USAGE_LABEL = {
  plants:       'รายการสินค้า',
  members:      'สมาชิก',
  movements30d: 'การเคลื่อนไหว (30 วัน)',
}

function fmtCount(n) {
  if (!Number.isFinite(n)) return '∞'
  return n.toLocaleString('th-TH')
}

function fillClass(ratio) {
  if (ratio >= 1)   return 'billing-usage-fill billing-usage-fill--over'
  if (ratio >= 0.8) return 'billing-usage-fill billing-usage-fill--warn'
  return 'billing-usage-fill'
}

export default function BillingCard() {
  const { currentStoreId } = useAuth()
  const { toast } = useToast()
  const [sub, setSub]         = useState(null)
  const [usage, setUsage]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [portalBusy, setPortalBusy] = useState(false)

  async function openPortal() {
    if (portalBusy || !currentStoreId) return
    setPortalBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: { store_id: currentStoreId },
      })
      if (error) throw error
      if (!data?.url) throw new Error('ไม่ได้ลิงก์ portal')
      window.location.href = data.url
    } catch (err) {
      toast.error(`เปิดหน้าจัดการไม่สำเร็จ: ${userMessage(err)}`)
      setPortalBusy(false)
    }
  }

  useEffect(() => {
    if (!currentStoreId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: subData }, { data: usageData }] = await Promise.all([
        supabase.from('subscriptions').select('*').eq('store_id', currentStoreId).maybeSingle(),
        supabase.rpc('get_store_usage', { p_store_id: currentStoreId }),
      ])
      if (cancelled) return
      setSub(subData ?? null)
      setUsage(usageData ?? null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [currentStoreId])

  if (loading) {
    return (
      <section className="card">
        <div className="card-header"><h2 className="card-title"><I.Chart size={14} /> แพ็กเกจ &amp; การใช้งาน</h2></div>
        <div className="settings-card-body" style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spinner size={20} />
        </div>
      </section>
    )
  }

  const tier   = tierOf(sub)
  const ratios = usageRatios(tier, usage ?? {})
  const isPaid = tier.id !== 'free'

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title"><I.Chart size={14} /> แพ็กเกจ &amp; การใช้งาน</h2>
      </div>
      <div className="settings-card-body">
        <div className="billing-tier-row">
          <div className="billing-tier-name">
            {tier.nameTh}
            <span className="billing-tier-badge">{tier.id}</span>
          </div>
          <div className="billing-status">
            {isPaid && tier.priceTHB > 0
              ? `${fmtTHB(tier.priceTHB)} ฿ / เดือน`
              : 'ใช้งานฟรี'}
          </div>
        </div>

        <div className="billing-usage">
          {Object.keys(tier.limits).map(key => {
            const used  = usage?.[key] ?? 0
            const limit = tier.limits[key]
            const ratio = ratios[key] ?? 0
            return (
              <div key={key} className="billing-usage-row">
                <div className="billing-usage-head">
                  <span>{USAGE_LABEL[key] || key}</span>
                  <span><strong>{fmtCount(used)}</strong> / {fmtCount(limit)}</span>
                </div>
                <div className="billing-usage-bar">
                  <div className={fillClass(ratio)} style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
                </div>
              </div>
            )
          })}
        </div>

        {sub?.current_period_end && (
          <p className="settings-hint" style={{ marginTop: 4 }}>
            รอบถัดไป: {new Date(sub.current_period_end).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
            {sub.cancel_at_period_end && <> · <strong style={{ color: 'var(--danger)' }}>ยกเลิกท้ายรอบ</strong></>}
          </p>
        )}

        <div className="billing-actions">
          <Link to="/pricing" className="btn btn-primary">
            <I.Chart size={13} /> {isPaid ? 'ดูแพ็กเกจอื่น' : 'อัปเกรด'}
          </Link>
          {isPaid && sub?.provider_customer_id && (
            <button className="btn btn-ghost" onClick={openPortal} disabled={portalBusy}>
              {portalBusy ? <Spinner size={14} /> : 'จัดการการเรียกเก็บ'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
