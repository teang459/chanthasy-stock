import React from 'react'
import { Link } from 'react-router-dom'
import { TIERS, TIER_ORDER, fmtTHB } from '../lib/billing'
import * as I from '../components/Icons'

export default function PricingPage() {
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
              <Link
                to="/settings"
                className={`btn ${isRec ? 'btn-primary' : 'btn-ghost'} pricing-cta`}
              >
                {t.priceTHB === 0 ? 'เริ่มต้นใช้งาน' : 'เลือกแพ็กเกจนี้'}
              </Link>
            </div>
          )
        })}
      </div>

      <p className="pricing-footnote">
        ราคารวม VAT แล้ว · ออกใบกำกับภาษีได้ · ระบบจ่ายเงินจริงจะเปิดเร็วๆ นี้
      </p>
    </div>
  )
}
