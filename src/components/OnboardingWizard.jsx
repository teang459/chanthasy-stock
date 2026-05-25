import React from 'react'
import { useNavigate } from 'react-router-dom'
import * as I from './Icons'

// Onboarding for a brand-new user with no store membership yet. After
// Phase C only a super admin can create new stores, so we explain the
// model and point the user at their admin.
export default function OnboardingWizard({ onDone }) {
  const navigate = useNavigate()

  function finish(goTo) {
    localStorage.setItem('onboarding_done', '1')
    onDone()
    if (goTo) navigate(goTo)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 480,
        padding: '32px 28px', boxShadow: 'var(--shadow-lg)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🌱</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>ยินดีต้อนรับสู่ Chanthasy Stock</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
          บัญชีของคุณยังไม่ได้ผูกกับสาขา —<br />
          ติดต่อ Admin เพื่อขอเพิ่มเป็นสมาชิกของสาขา<br />
          จากนั้นจะเริ่มใช้งานระบบได้ทันที
        </p>
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 12, fontSize: 13, color: 'var(--muted)',
          textAlign: 'left', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <I.Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>สิทธิ์ที่ Admin จะกำหนดให้คุณ:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
              <li>บทบาท (Store Admin / Staff / Viewer)</li>
              <li>สิทธิ์ขาย รับเข้า ปรับสต็อก ดูรายงาน ปิดยอด ฯลฯ</li>
            </ul>
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', fontSize: 14, padding: '10px 0' }}
          onClick={() => finish(null)}
        >
          เข้าใจแล้ว
        </button>
      </div>
    </div>
  )
}
