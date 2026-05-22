import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Spinner from '../components/Spinner'
import Field from '../components/Field'
import * as I from '../components/Icons'

export default function SettingsPage() {
  const { user, profile, updateProfile, changePassword, logout } = useAuth()
  const { toast } = useToast()

  const [profileForm, setProfileForm] = useState({ name:'', initials:'', role:'' })
  const [pwForm, setPwForm]           = useState({ newPw:'', confirmPw:'', showPw: false })
  const [notifPerm, setNotifPerm]     = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    if (profile) setProfileForm({ name: profile.name??'', initials: profile.initials??'', role: profile.role??'staff' })
  }, [profile])

  async function handleProfileSave(e) {
    e.preventDefault()
    if (!profileForm.name?.trim()) { toast.error('กรุณาระบุชื่อ'); return }
    setSaving(true)
    const { error } = await updateProfile({ name: profileForm.name.trim(), initials: profileForm.initials?.trim() || profileForm.name.slice(0,2), role: profileForm.role })
    if (error) toast.error(`บันทึกไม่สำเร็จ: ${error.message}`)
    else toast.success('บันทึกโปรไฟล์สำเร็จ')
    setSaving(false)
  }

  async function handlePwSave(e) {
    e.preventDefault()
    if (!pwForm.newPw)                         { toast.error('กรุณาระบุรหัสผ่านใหม่'); return }
    if (pwForm.newPw.length < 6)               { toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return }
    if (pwForm.newPw !== pwForm.confirmPw)     { toast.error('รหัสผ่านไม่ตรงกัน'); return }
    setSaving(true)
    const { error } = await changePassword(pwForm.newPw)
    if (error) toast.error(`เปลี่ยนรหัสผ่านไม่สำเร็จ: ${error.message}`)
    else { toast.success('เปลี่ยนรหัสผ่านสำเร็จ'); setPwForm({ newPw:'', confirmPw:'', showPw:false }) }
    setSaving(false)
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
        <button className="btn btn-danger" onClick={logout} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <I.LogOut size={14} /> ออกจากระบบ
        </button>
      </div>

      <div className="settings-grid">
        {/* Profile */}
        <section className="card">
          <div className="card-header"><h2 className="card-title"><I.User size={14} /> โปรไฟล์</h2></div>
          <form onSubmit={handleProfileSave} className="form-stack">
            <div className="settings-email">
              <I.Lock size={12} />
              <span>{user?.email}</span>
            </div>
            <Field label="ชื่อผู้ใช้" required>
              <input value={profileForm.name} onChange={e => setProfileForm(f=>({...f,name:e.target.value}))} placeholder="คุณสมใจ" />
            </Field>
            <Field label="ชื่อย่อ (แสดงใน Avatar)" hint="1-3 ตัวอักษร">
              <input value={profileForm.initials} onChange={e => setProfileForm(f=>({...f,initials:e.target.value}))} placeholder="สม" maxLength={3} />
            </Field>
            <Field label="ตำแหน่ง">
              <select value={profileForm.role} onChange={e => setProfileForm(f=>({...f,role:e.target.value}))}>
                <option value="admin">Admin — จัดการทุกอย่าง</option>
                <option value="staff">Staff — จัดการสต็อก</option>
                <option value="viewer">Viewer — ดูข้อมูลได้อย่างเดียว</option>
              </select>
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
          <form onSubmit={handlePwSave} className="form-stack">
            <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 6 ตัวอักษร">
              <div style={{ position:'relative' }}>
                <input type={pwForm.showPw ? 'text' : 'password'} value={pwForm.newPw}
                  onChange={e => setPwForm(f=>({...f,newPw:e.target.value}))}
                  placeholder="รหัสผ่านใหม่" style={{ paddingRight:36 }} />
                <button type="button" onClick={() => setPwForm(f=>({...f,showPw:!f.showPw}))}
                  style={{ position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--muted)',padding:2 }}>
                  {pwForm.showPw ? <I.EyeOff size={13} /> : <I.Eye size={13} />}
                </button>
              </div>
            </Field>
            <Field label="ยืนยันรหัสผ่านใหม่">
              <input type={pwForm.showPw ? 'text' : 'password'} value={pwForm.confirmPw}
                onChange={e => setPwForm(f=>({...f,confirmPw:e.target.value}))}
                placeholder="ยืนยันรหัสผ่าน" />
            </Field>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Spinner size={14} color="#fff" /> : 'เปลี่ยนรหัสผ่าน'}
              </button>
            </div>
          </form>
        </section>

        {/* Notifications */}
        <section className="card">
          <div className="card-header"><h2 className="card-title"><I.Bell size={14} /> การแจ้งเตือน</h2></div>
          <div style={{ padding:'0 0 16px' }}>
            <div className="notif-status">
              สถานะ: {' '}
              <strong style={{ color: notifPerm === 'granted' ? 'var(--accent)' : notifPerm === 'denied' ? 'var(--danger)' : 'var(--muted)' }}>
                {notifPerm === 'granted' ? 'เปิดใช้งานแล้ว' : notifPerm === 'denied' ? 'ถูกบล็อก' : notifPerm === 'unsupported' ? 'ไม่รองรับ' : 'ยังไม่ได้เปิดใช้งาน'}
              </strong>
            </div>
            <p style={{ fontSize:13, color:'var(--muted)', margin:'8px 0 16px', lineHeight:1.6 }}>
              เปิดใช้งานการแจ้งเตือนเพื่อรับการแจ้งเตือนเมื่อสต็อกต่ำ หรือมีนัดหมายใน Desktop
            </p>
            {notifPerm !== 'granted' && notifPerm !== 'unsupported' && (
              <button className="btn btn-primary" onClick={requestNotifPermission}>
                <I.Bell size={13} /> เปิดใช้งานการแจ้งเตือน
              </button>
            )}
            {notifPerm === 'granted' && (
              <button className="btn btn-ghost" onClick={() => new Notification('ทดสอบ', { body:'การแจ้งเตือนทำงานปกติ ✓' })}>
                ทดสอบการแจ้งเตือน
              </button>
            )}
          </div>
        </section>

        {/* App info */}
        <section className="card">
          <div className="card-header"><h2 className="card-title"><I.Info size={14} /> เกี่ยวกับ</h2></div>
          <div className="about-list">
            <div className="about-row"><span>เวอร์ชัน</span><span>3.0.0</span></div>
            <div className="about-row"><span>Framework</span><span>React 18 + Vite</span></div>
            <div className="about-row"><span>Database</span><span>Supabase (PostgreSQL)</span></div>
            <div className="about-row"><span>อีเมล</span><span>{user?.email}</span></div>
          </div>
        </section>
      </div>
    </div>
  )
}
