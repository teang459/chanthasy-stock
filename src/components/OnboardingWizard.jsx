import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { userMessage } from '../lib/errors'
import Spinner from './Spinner'

const STEPS = ['ยินดีต้อนรับ', 'ตั้งค่าร้าน', 'เริ่มใช้งาน']

export default function OnboardingWizard({ onDone }) {
  const { user, profile, refreshProfile } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [shopName, setShopName] = useState('')
  const [saving, setSaving] = useState(false)

  async function saveShopName() {
    if (!shopName.trim()) return
    setSaving(true)
    const { error } = await supabase.from('profiles')
      .update({ shop_name: shopName.trim() })
      .eq('id', user.id)
    if (error) {
      setSaving(false)
      toast.error(`บันทึกไม่สำเร็จ: ${userMessage(error)}`)
      return
    }
    await refreshProfile?.()
    setSaving(false)
    setStep(2)
  }

  function finish(goTo) {
    localStorage.setItem('onboarding_done', '1')
    onDone()
    if (goTo) navigate(goTo)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 480,
        padding: '32px 28px', boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, justifyContent: 'center' }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8, height: 8, borderRadius: 4,
              background: i <= step ? 'var(--primary)' : 'var(--border)',
              transition: 'all 0.3s ease'
            }} />
          ))}
        </div>

        {step === 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🌱</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>ยินดีต้อนรับสู่ Chanthasy Stock</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
              ระบบจัดการสต็อกต้นไม้ที่ช่วยให้คุณติดตาม<br />
              สินค้า ประวัติ และแจ้งเตือนสต็อกต่ำได้ง่ายๆ
            </p>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '12px 0' }} onClick={() => setStep(1)}>
              เริ่มตั้งค่า →
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>ตั้งชื่อร้านของคุณ</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 20px' }}>ชื่อร้านจะแสดงในแถบบนของแอป</p>
            <div className="field">
              <span className="field-label">ชื่อร้าน</span>
              <input
                autoFocus
                placeholder="เช่น ร้านต้นไม้สวยงาม, Green Garden Shop"
                value={shopName}
                onChange={e => setShopName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && shopName.trim() && saveShopName()}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => finish(null)}>
                ข้าม
              </button>
              <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }}
                disabled={!shopName.trim() || saving} onClick={saveShopName}>
                {saving ? <Spinner size={14} color="#fff" /> : 'บันทึกและต่อไป →'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>พร้อมใช้งานแล้ว! 🎉</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 20px' }}>เริ่มต้นได้จากเมนูเหล่านี้</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { icon: '📦', label: 'เพิ่มต้นไม้', desc: 'เพิ่มสินค้าเข้าสต็อก', to: '/stock' },
                { icon: '🏷️', label: 'ตั้งหมวดหมู่', desc: 'จัดกลุ่มต้นไม้', to: '/categories' },
                { icon: '⚙️', label: 'ตั้งค่าโปรไฟล์', desc: 'แก้ไขชื่อและข้อมูล', to: '/settings' },
              ].map(({ icon, label, desc, to }) => (
                <button key={to} onClick={() => finish(to)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 22 }}>{icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{desc}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>→</span>
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}
              onClick={() => finish('/')}>
              ไปที่แดชบอร์ด
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
