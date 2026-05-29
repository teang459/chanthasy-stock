import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { TIERS, TIER_ORDER, fmtTHB } from '../lib/billing'
import { userMessage } from '../lib/errors'
import * as I from '../components/Icons'
import Spinner from '../components/Spinner'

export default function PricingPage() {
  const { user, currentStoreId } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [busyTier, setBusyTier] = useState(null)

  async function handleSelect(tier) {
    if (tier.priceTHB === 0) {
      navigate(user ? '/settings' : '/login')
      return
    }
    if (!user) { navigate('/login'); return }
    if (!currentStoreId) { toast.error('ยังไม่ได้เลือกสาขา'); return }
    setBusyTier(tier.id)
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { store_id: currentStoreId, tier: tier.id },
      })
      if (error) throw error
      if (!data?.url) throw new Error('ไม่ได้ลิงก์ checkout')
      window.location.href = data.url
    } catch (err) {
      toast.error(`เปิดหน้าจ่ายเงินไม่สำเร็จ: ${userMessage(err)}`)
      setBusyTier(null)
    }
  }

  return (
    <div className="pricing-page">
      <header className="pricing-header">
        <Link to="/" className="pricing-back" aria-label="กลับหน้าหลัก">
          <I.Chevron size={14} style={{ transform: 'rotate(180deg)' }} /> กลับ
        </Link>
        <h1>เลือกแพ็กเกจที่เหมาะกับร้านของคุณ</h1>
        <p>เริ่มฟรี อัปเกรดเมื่อพร้อม ยกเลิกได้ทุกเมื่อ</p>
      </header>

      <div className="pricing-grid">
        {TIER_ORDER.map(id => {
          const t = TIERS[id]
          const isRec = !!t.recommended
          const busy = busyTier === t.id
          return (
            <div key={id} className={`pricing-card${isRec ? ' pricing-card--recommended' : ''}`}>
              {isRec && <div className="pricing-badge">แนะนำ</div>}
              <h2 className="pricing-name">{t.nameTh}</h2>
              <div className="pricing-price">
                {t.priceTHB === 0
                  ? <span className="pricing-price-num">ฟรี</span>
                  : <>
                      <span className="pricing-price-num">{fmtTHB(t.priceTHB)}</span>
                      <span className="pricing-price-unit">฿ / เดือน</span>
                    </>
                }
              </div>
              <p className="pricing-blurb">{t.blurb}</p>
              <ul className="pricing-features">
                {t.features.map(f => (
                  <li key={f}><I.Check size={13} /> {f}</li>
                ))}
              </ul>
              <button
                type="button"
                className={`btn ${isRec ? 'btn-primary' : 'btn-ghost'} pricing-cta`}
                onClick={() => handleSelect(t)}
                disabled={busy || (busyTier && !busy)}
              >
                {busy ? <Spinner size={14} color={isRec ? '#fff' : undefined} />
                  : t.priceTHB === 0 ? 'เริ่มต้นใช้งาน' : 'เลือกแพ็กเกจนี้'}
              </button>
            </div>
          )
        })}
      </div>

      <p className="pricing-footnote">
        ราคารวม VAT แล้ว · ออกใบกำกับภาษีได้ · ชำระผ่าน Stripe (รองรับบัตร / PromptPay)
      </p>
    </div>
  )
}
