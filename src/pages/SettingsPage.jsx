import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import Spinner from '../components/Spinner'
import Field from '../components/Field'
import MfaEnroll from '../components/MfaEnroll'
import * as I from '../components/Icons'
import { userMessage, passwordIssue } from '../lib/errors'
import { useT } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function SettingsPage() {
  const { user, profile, stores, currentStoreId, updateProfile, refreshProfile,
          changePassword, logout, isSuperAdmin } = useAuth()
  const { toast } = useToast()
  const t = useT()
  const currentStore = stores.find(s => s.id === currentStoreId)
  const canEditStore = isSuperAdmin || currentStore?.role === 'store_admin'

  const [profileForm, setProfileForm] = useState({ name: '', initials: '' })
  const [storeForm, setStoreForm]     = useState({ name: '', address: '', phone: '', tax_id: '', vat_rate: '0', vat_inclusive: true, currency: 'THB' })
  const [pwForm, setPwForm]           = useState({ newPw: '', confirmPw: '', showPw: false })
  const [notifPerm, setNotifPerm]     = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [saving, setSaving]           = useState(false)
  const [savingStore, setSavingStore] = useState(false)
  const [exporting, setExporting]     = useState(false)

  useEffect(() => {
    if (profile) {
      setProfileForm({ name: profile.name ?? '', initials: profile.initials ?? '' })
    }
  }, [profile])

  useEffect(() => {
    if (currentStore) {
      setStoreForm({
        name: currentStore.name ?? '',
        address: currentStore.address ?? '',
        phone: currentStore.phone ?? '',
        tax_id: currentStore.tax_id ?? '',
        vat_rate: String(currentStore.vat_rate ?? 0),
        vat_inclusive: currentStore.vat_inclusive ?? true,
        currency: currentStore.currency ?? 'THB',
      })
    }
  }, [currentStore?.id, currentStore?.name, currentStore?.address, currentStore?.phone, currentStore?.tax_id, currentStore?.vat_rate, currentStore?.vat_inclusive, currentStore?.currency])

  async function handleStoreSave(e) {
    e.preventDefault()
    if (!currentStore) return
    if (!storeForm.name?.trim()) { toast.error('กรุณาระบุชื่อสาขา'); return }
    const rate = Number(storeForm.vat_rate)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      toast.error('อัตรา VAT ต้องอยู่ระหว่าง 0 - 100')
      return
    }
    setSavingStore(true)
    const { error } = await supabase.from('stores').update({
      name: storeForm.name.trim(),
      address: storeForm.address?.trim() || null,
      phone: storeForm.phone?.trim() || null,
      tax_id: storeForm.tax_id?.trim() || null,
      vat_rate: rate,
      vat_inclusive: !!storeForm.vat_inclusive,
      currency: storeForm.currency,
    }).eq('id', currentStore.id)
    setSavingStore(false)
    if (error) toast.error(`บันทึกไม่สำเร็จ: ${userMessage(error)}`)
    else {
      toast.success('บันทึกข้อมูลสาขาสำเร็จ')
      await refreshProfile?.()
    }
  }

  async function handleProfileSave(e) {
    e.preventDefault()
    if (!profileForm.name?.trim()) { toast.error('กรุณาระบุชื่อ'); return }
    setSaving(true)
    const { error } = await updateProfile({
      name: profileForm.name.trim(),
      initials: profileForm.initials?.trim() || profileForm.name.slice(0, 2),
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
        <div><h1 className="page-title">{t('settings.page_title')}</h1></div>
        <button className="btn btn-danger" onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <I.LogOut size={14} /> {t('nav.logout')}
        </button>
      </div>

      <div className="settings-grid">
        {/* Personal profile */}
        <section className="card">
          <div className="card-header"><h2 className="card-title"><I.User size={14} /> โปรไฟล์ส่วนตัว</h2></div>
          <form onSubmit={handleProfileSave} className="form-stack settings-card-body">
            <div className="settings-email">
              <I.Lock size={12} />
              <span>{user?.email}</span>
            </div>
            <Field label="ชื่อผู้ใช้" required>
              <input value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} placeholder="คุณสมใจ" />
            </Field>
            <Field label="ชื่อย่อ (แสดงใน Avatar)" hint="1-3 ตัวอักษร">
              <input value={profileForm.initials} onChange={e => setProfileForm(f => ({ ...f, initials: e.target.value }))} placeholder="สม" maxLength={3} />
            </Field>
            <Field label="ตำแหน่งในสาขา" hint="ตั้งโดย Store Admin ผ่าน Admin Panel">
              <input
                value={
                  isSuperAdmin ? 'Super Admin'
                  : currentStore?.role === 'store_admin' ? 'Store Admin'
                  : currentStore?.role === 'viewer'     ? 'Viewer'
                  : currentStore                         ? 'Staff'
                  : '—'
                }
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

        {/* Store info — for store admins of the current store */}
        {currentStore && (
          <section className="card">
            <div className="card-header">
              <h2 className="card-title"><I.Box size={14} /> ข้อมูลสาขา ({currentStore.code})</h2>
            </div>
            <form onSubmit={handleStoreSave} className="form-stack settings-card-body">
              {!canEditStore && (
                <div className="settings-hint" style={{ marginTop: 0 }}>
                  <I.Lock size={12} /> เฉพาะ Store Admin หรือ Super Admin เท่านั้นที่แก้ไขข้อมูลสาขาได้
                </div>
              )}
              <Field label="ชื่อสาขา" required>
                <input value={storeForm.name} onChange={e => setStoreForm(f => ({ ...f, name: e.target.value }))} disabled={!canEditStore} />
              </Field>
              <Field label="ที่อยู่">
                <input value={storeForm.address} onChange={e => setStoreForm(f => ({ ...f, address: e.target.value }))} disabled={!canEditStore} />
              </Field>
              <Field label="เบอร์โทร">
                <input value={storeForm.phone} onChange={e => setStoreForm(f => ({ ...f, phone: e.target.value }))} disabled={!canEditStore} />
              </Field>
              <Field label="เลขผู้เสียภาษี" hint="ปล่อยว่างถ้าไม่จด VAT">
                <input value={storeForm.tax_id} onChange={e => setStoreForm(f => ({ ...f, tax_id: e.target.value }))} disabled={!canEditStore} placeholder="0-0000-00000-00-0" />
              </Field>
              <Field label="อัตรา VAT (%)" hint="ตั้ง 0 หากไม่คิดภาษี (ไทย = 7)">
                <input type="number" step="0.01" min="0" max="100" value={storeForm.vat_rate}
                       onChange={e => setStoreForm(f => ({ ...f, vat_rate: e.target.value }))} disabled={!canEditStore} />
              </Field>
              <Field label="โหมด VAT">
                <select value={storeForm.vat_inclusive ? '1' : '0'} disabled={!canEditStore}
                        onChange={e => setStoreForm(f => ({ ...f, vat_inclusive: e.target.value === '1' }))}>
                  <option value="1">รวมในราคา (รีเทล)</option>
                  <option value="0">แยกต่างหาก (B2B)</option>
                </select>
              </Field>
              <Field label="สกุลเงินของสาขา">
                <select value={storeForm.currency} disabled={!canEditStore}
                        onChange={e => setStoreForm(f => ({ ...f, currency: e.target.value }))}>
                  <option value="THB">บาท (THB)</option>
                  <option value="LAK">กีบ (LAK)</option>
                </select>
              </Field>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={savingStore || !canEditStore}>
                  {savingStore ? <Spinner size={14} color="#fff" /> : 'บันทึกข้อมูลสาขา'}
                </button>
              </div>
            </form>
          </section>
        )}

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

        {/* Language */}
        <section className="card">
          <div className="card-header"><h2 className="card-title">🌐 {t('settings.locale_title')}</h2></div>
          <div className="settings-card-body">
            <p className="settings-hint">{t('settings.locale_hint')}</p>
            <div style={{ marginTop: 6 }}>
              <LanguageSwitcher />
            </div>
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
