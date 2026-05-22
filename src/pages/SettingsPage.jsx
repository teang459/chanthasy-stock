import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { supabase } from '../lib/supabase'
import Spinner from '../components/Spinner'
import Field from '../components/Field'
import MfaEnroll from '../components/MfaEnroll'
import * as I from '../components/Icons'
import { userMessage, passwordIssue } from '../lib/errors'

export default function SettingsPage() {
  const { user, profile, updateProfile, changePassword, logout } = useAuth()
  const { toast } = useToast()
  const { currency, setCurrency } = useCurrency()

  const [profileForm, setProfileForm] = useState({ name: '', initials: '', shop_name: '' })
  const [pwForm, setPwForm]           = useState({ newPw: '', confirmPw: '', showPw: false })
  const [notifPerm, setNotifPerm]     = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [saving, setSaving]           = useState(false)
  const [exporting, setExporting]     = useState(false)

  useEffect(() => {
    if (profile) setProfileForm({ name: profile.name ?? '', initials: profile.initials ?? '', shop_name: profile.shop_name ?? '' })
  }, [profile])

  async function handleProfileSave(e) {
    e.preventDefault()
    if (!profileForm.name?.trim()) { toast.error('กรุณาระบุชื่อ'); return }
    setSaving(true)
    const { error } = await updateProfile({
      name: profileForm.name.trim(),
      initials: profileForm.initials?.trim() || profileForm.name.slice(0, 2),
      shop_name: profileForm.shop_name?.trim() || null,
    })
    if (error) toast.error(`บันทึกไม่สำเร็จ: ${userMessage(error)}`)
    else toast.success('บันทึกโปรไฟล์สำเร็จ')
    setSaving(false)
  }

  async function handlePwSave(e) {
    e.preventDefault()
    const issue = passwordIssue(pwForm.newPw)
    if (issue)                              { toast.error(issue); return }
    if (pwForm.newPw !== pwForm.confirmPw)  { toast.error('รหัสผ่านไม่ตรงกัน'); return }
    setSaving(true)
    const { error } = await changePassword(pwForm.newPw)
    if (error) toast.error(`เปลี่ยนรหัสผ่านไม่สำเร็จ: ${userMessage(error)}`)
    else { toast.success('เปลี่ยนรหัสผ่านสำเร็จ'); setPwForm({ newPw: '', confirmPw: '', showPw: false }) }
    setSaving(false)
  }

  async function handleExportAll() {
    setExporting(true)
    try {
      const [plants, cats, sups, moves, cal] = await Promise.all([
        supabase.from('plants').select('*'),
        supabase.from('categories').select('*'),
        supabase.from('suppliers').select('*'),
        supabase.from('movements').select('*').order('created_at', { ascending: false }),
        supabase.from('calendar_events').select('*'),
      ])
      const dump = {
        exported_at: new Date().toISOString(),
        profile,
        plants:    plants.data ?? [],
        categories: cats.data ?? [],
        suppliers: sups.data ?? [],
        movements: moves.data ?? [],
        calendar_events: cal.data ?? [],
      }
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `chanthasy-backup-${new Date().toISOString().slice(0, 10)}.json`,
      })
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
      toast.success('ส่งออกข้อมูลทั้งหมดสำเร็จ')
    } catch (err) {
      toast.error(`ส่งออกไม่สำเร็จ: ${userMessage(err)}`)
    } finally {
      setExporting(false)
    }
  }

  async function requestNotifPermission() {
    if (!('Notification' in window)) { toast.info('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน'); return }
    const p = await Notification.requestPermission()
    setNotifPerm(p)
    if (p === 'granted') {
      toast.success('เปิดใช้งานการแจ้งเตือนสำเร็จ')
      new Notification('Chanthasy Stock', { body: 'เปิดใช้งานการแจ้งเตือนสำเร็จแล้ว' })
    } else if (p === 'denied') {
      toast.error('บล็อกการแจ้งเตือน — โปรดเปิดใช้งานในการตั้งค่าเบราว์เซอร์')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">ตั้งค่า</h1></div>
        <button className="btn btn-danger" onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <I.LogOut size={14} /> ออกจากระบบ
        </button>
      </div>

      <div className="settings-grid">
        {/* Profile */}
        <section className="card">
          <div className="card-header"><h2 className="card-title"><I.User size={14} /> โปรไฟล์</h2></div>
          <form onSubmit={handleProfileSave} className="form-stack settings-card-body">
            <div className="settings-email">
              <I.Lock size={12} />
              <span>{user?.email}</span>
            </div>
            <Field label="ชื่อร้าน" hint="แสดงในแถบด้านข้างและส่วนหัว">
              <input value={profileForm.shop_name} onChange={e => setProfileForm(f => ({ ...f, shop_name: e.target.value }))} placeholder="ร้านต้นไม้สวยงาม" />
            </Field>
            <Field label="ชื่อผู้ใช้" required>
              <input value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} placeholder="คุณสมใจ" />
            </Field>
            <Field label="ชื่อย่อ (แสดงใน Avatar)" hint="1-3 ตัวอักษร">
              <input value={profileForm.initials} onChange={e => setProfileForm(f => ({ ...f, initials: e.target.value }))} placeholder="สม" maxLength={3} />
            </Field>
            <Field label="ตำแหน่ง" hint="เปลี่ยนได้โดย Admin เท่านั้น">
              <input
                value={profile?.role === 'admin' ? 'Admin' : profile?.role === 'viewer' ? 'Viewer' : 'Staff'}
                readOnly
                style={{ background: 'var(--bg)', cursor: 'default', color: 'var(--muted)' }}
              />
            </Field>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Spinner size={14} color="#fff" /> : 'บันทึกโปรไฟล์'}
              </button>
            </div>
          </form>
        </section>

        {/* Change Password */}
        <section className="card">
          <div className="card-header"><h2 className="card-title"><I.Lock size={14} /> เปลี่ยนรหัสผ่าน</h2></div>
          <form onSubmit={handlePwSave} className="form-stack settings-card-body">
            <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 8 ตัวอักษร + ตัวเลข">
              <div style={{ position: 'relative' }}>
                <input type={pwForm.showPw ? 'text' : 'password'} value={pwForm.newPw}
                  onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))}
                  placeholder="รหัสผ่านใหม่" style={{ paddingRight: 36 }} />
                <button type="button" onClick={() => setPwForm(f => ({ ...f, showPw: !f.showPw }))}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}>
                  {pwForm.showPw ? <I.EyeOff size={13} /> : <I.Eye size={13} />}
                </button>
              </div>
            </Field>
            <Field label="ยืนยันรหัสผ่านใหม่">
              <input type={pwForm.showPw ? 'text' : 'password'} value={pwForm.confirmPw}
                onChange={e => setPwForm(f => ({ ...f, confirmPw: e.target.value }))}
                placeholder="ยืนยันรหัสผ่าน" />
            </Field>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Spinner size={14} color="#fff" /> : 'เปลี่ยนรหัสผ่าน'}
              </button>
            </div>
          </form>
        </section>

        {/* Currency */}
        <section className="card">
          <div className="card-header"><h2 className="card-title"><I.Chart size={14} /> สกุลเงิน</h2></div>
          <div className="settings-card-body">
            <p className="settings-hint">เลือกสกุลเงินที่ใช้แสดงราคาในระบบ</p>
            <div className="currency-options">
              <button className={`currency-btn ${currency === 'THB' ? 'active' : ''}`}
                onClick={() => { setCurrency('THB'); toast.success('เปลี่ยนเป็นสกุลเงินบาท (฿)') }}>
                <span className="currency-symbol">฿</span>
                <div><div className="currency-name">บาทไทย</div><div className="currency-code">THB</div></div>
              </button>
              <button className={`currency-btn ${currency === 'LAK' ? 'active' : ''}`}
                onClick={() => { setCurrency('LAK'); toast.success('ປ່ຽນເປັນສະກຸນເງິນກີບ (₭)') }}>
                <span className="currency-symbol">₭</span>
                <div><div className="currency-name">ກີບລາວ</div><div className="currency-code">LAK</div></div>
              </button>
            </div>
            <p className="settings-hint" style={{ marginTop: 12 }}>
              ปัจจุบัน: <strong>{currency === 'LAK' ? 'ກີບ (₭)' : 'บาท (฿)'}</strong>
            </p>
          </div>
        </section>

        {/* Notifications */}
        <section className="card">
          <div className="card-header"><h2 className="card-title"><I.Bell size={14} /> การแจ้งเตือน</h2></div>
          <div className="settings-card-body">
            <div className="notif-status">
              สถานะ:{' '}
              <strong style={{ color: notifPerm === 'granted' ? 'var(--accent)' : notifPerm === 'denied' ? 'var(--danger)' : 'var(--muted)' }}>
                {notifPerm === 'granted' ? 'เปิดใช้งานแล้ว' : notifPerm === 'denied' ? 'ถูกบล็อก' : notifPerm === 'unsupported' ? 'ไม่รองรับ' : 'ยังไม่ได้เปิดใช้งาน'}
              </strong>
            </div>
            <p className="settings-hint" style={{ marginTop: 8 }}>
              เปิดใช้งานการแจ้งเตือนเพื่อรับแจ้งเตือนเมื่อสต็อกต่ำหรือมีนัดหมายใน Desktop
            </p>
            <div style={{ marginTop: 14 }}>
              {notifPerm !== 'granted' && notifPerm !== 'unsupported' && (
                <button className="btn btn-primary" onClick={requestNotifPermission}>
                  <I.Bell size={13} /> เปิดใช้งานการแจ้งเตือน
                </button>
              )}
              {notifPerm === 'granted' && (
                <button className="btn btn-ghost" onClick={() => new Notification('ทดสอบ', { body: 'การแจ้งเตือนทำงานปกติ ✓' })}>
                  ทดสอบการแจ้งเตือน
                </button>
              )}
            </div>
          </div>
        </section>

        {/* 2FA */}
        <section className="card">
          <div className="card-header"><h2 className="card-title">🔐 การยืนยัน 2 ขั้นตอน</h2></div>
          <div className="settings-card-body">
            <MfaEnroll />
          </div>
        </section>

        {/* Data export */}
        <section className="card">
          <div className="card-header"><h2 className="card-title"><I.Download size={14} /> ส่งออกข้อมูล</h2></div>
          <div className="settings-card-body">
            <p className="settings-hint">ดาวน์โหลดข้อมูลทั้งหมดของคุณเป็นไฟล์ JSON (ตามสิทธิ์ PDPA)</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleExportAll} disabled={exporting}>
              {exporting ? <Spinner size={13} color="#fff" /> : <><I.Download size={13} /> ดาวน์โหลด Backup</>}
            </button>
          </div>
        </section>

        {/* App info */}
        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header"><h2 className="card-title"><I.Info size={14} /> เกี่ยวกับ</h2></div>
          <div className="about-list">
            <div className="about-row"><span>เวอร์ชัน</span><span>3.0.0</span></div>
            <div className="about-row"><span>Framework</span><span>React 18 + Vite</span></div>
            <div className="about-row"><span>Database</span><span>Supabase (PostgreSQL)</span></div>
            <div className="about-row"><span>สกุลเงิน</span><span>{currency === 'LAK' ? 'ກີບ (₭) LAK' : 'บาท (฿) THB'}</span></div>
            <div className="about-row"><span>อีเมล</span><span>{user?.email}</span></div>
          </div>
        </section>
      </div>
    </div>
  )
}
