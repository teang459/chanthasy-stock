import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Spinner from '../components/Spinner'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceLabel: 'ฟรี',
    color: 'var(--accent)',
    features: ['สต็อกสูงสุด 50 รายการ', 'ผู้ใช้ 1 คน', 'รายงานพื้นฐาน', 'แจ้งเตือนในแอป'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 299,
    priceLabel: '฿299/เดือน',
    color: 'oklch(55% 0.18 250)',
    popular: true,
    features: ['สต็อกสูงสุด 500 รายการ', 'ทีมสูงสุด 3 คน', 'รายงานขั้นสูง', 'แจ้งเตือนอีเมล', 'ส่งออก CSV'],
  },
  {
    id: 'business',
    name: 'Business',
    price: 799,
    priceLabel: '฿799/เดือน',
    color: 'oklch(50% 0.15 30)',
    features: ['สต็อกไม่จำกัด', 'ทีมไม่จำกัด', 'Admin Panel', 'Priority Support', 'API Access'],
  },
]

export default function BillingPage() {
  const { user, ownerId } = useAuth()
  const { toast } = useToast()
  const [sub, setSub]       = useState(null)
  const [plants, setPlants] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: s }, { count }] = await Promise.all([
      supabase.from('subscriptions').select('*, plans(*)').eq('owner_id', ownerId).single(),
      supabase.from('plants').select('id', { count: 'exact', head: true }),
    ])
    setSub(s)
    setPlants(count ?? 0)
    setLoading(false)
  }

  async function handleUpgrade(planId) {
    if (planId === 'free') return
    toast.info('ระบบชำระเงินจะเปิดให้บริการเร็วๆ นี้ กรุณาติดต่อผู้ดูแลระบบ')
  }

  const currentPlan = sub?.plans ?? { id: 'free', name: 'Free', max_plants: 50 }
  const usagePct = currentPlan.max_plants ? Math.min(100, Math.round((plants / currentPlan.max_plants) * 100)) : 0

  if (loading) return <div className="page-center"><Spinner size={32} /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">แพ็กเกจและการชำระเงิน</h1>
          <p className="page-sub">แพ็กเกจปัจจุบัน: <strong>{currentPlan.name}</strong></p>
        </div>
      </div>

      {/* Usage summary */}
      <div className="card" style={{ marginBottom: 24, padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>การใช้งานสต็อก</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {plants} / {currentPlan.max_plants ?? '∞'} รายการ
          </span>
        </div>
        {currentPlan.max_plants && (
          <>
            <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, transition: 'width 0.5s ease',
                width: `${usagePct}%`,
                background: usagePct >= 90 ? 'var(--danger)' : usagePct >= 70 ? 'var(--amber-ink)' : 'var(--accent)',
              }} />
            </div>
            {usagePct >= 80 && (
              <div style={{ marginTop: 8, fontSize: 12, color: usagePct >= 90 ? 'var(--danger-ink)' : 'var(--amber-ink)' }}>
                {usagePct >= 90 ? '⚠️ ใกล้ถึงขีดจำกัด — อัปเกรดเพื่อเพิ่มพื้นที่' : '📊 ใช้งานไปมากกว่า 80% แล้ว'}
              </div>
            )}
          </>
        )}
        {!currentPlan.max_plants && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>ไม่จำกัดจำนวนรายการ</div>
        )}
      </div>

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
        {PLANS.map(plan => {
          const isCurrent = currentPlan.id === plan.id
          return (
            <div key={plan.id} style={{
              background: 'var(--surface)', border: `2px solid ${isCurrent ? plan.color : 'var(--border)'}`,
              borderRadius: 14, padding: '24px 20px', position: 'relative',
            }}>
              {plan.popular && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: plan.color, color: '#fff', fontSize: 11, fontWeight: 700,
                  padding: '3px 12px', borderRadius: 20,
                }}>
                  ยอดนิยม
                </div>
              )}
              {isCurrent && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: plan.color, color: '#fff', fontSize: 10, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 20,
                }}>
                  ใช้งานอยู่
                </div>
              )}
              <div style={{ fontWeight: 700, fontSize: 18, color: plan.color, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>{plan.priceLabel}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: plan.color, flexShrink: 0 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <button
                className={`btn ${isCurrent ? 'btn-ghost' : 'btn-primary'}`}
                style={{ width: '100%', justifyContent: 'center', background: isCurrent ? undefined : plan.color, borderColor: plan.color }}
                disabled={isCurrent}
                onClick={() => handleUpgrade(plan.id)}
              >
                {isCurrent ? 'แพ็กเกจปัจจุบัน' : `อัปเกรดเป็น ${plan.name}`}
              </button>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ padding: '16px 20px', fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span>ℹ️</span>
        <span>ต้องการอัปเกรดหรือมีคำถามเรื่องการชำระเงิน กรุณาติดต่อ <strong>chanthasymb45@gmail.com</strong> · รองรับ PromptPay และบัตรเครดิต</span>
      </div>
    </div>
  )
}
