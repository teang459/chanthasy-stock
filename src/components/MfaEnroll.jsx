import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { userMessage } from '../lib/errors'
import Spinner from './Spinner'
import * as I from './Icons'

export default function MfaEnroll() {
  const { toast } = useToast()
  const [factors, setFactors]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [enrolling, setEnrolling]   = useState(null) // { factorId, qr, secret, uri }
  const [code, setCode]             = useState('')
  const [verifying, setVerifying]   = useState(false)
  const [startingEnroll, setStartingEnroll] = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => { loadFactors() }, [])

  async function loadFactors() {
    setLoading(true)
    const { data, error: err } = await supabase.auth.mfa.listFactors()
    if (err) setError(userMessage(err) + ' (โหลด factors ไม่สำเร็จ)')
    setFactors(data?.totp ?? [])
    setLoading(false)
  }

  // Remove any unverified factors before starting a new enrollment.
  // Supabase keeps unverified factors around until explicitly removed.
  async function cleanupUnverified(currentList) {
    const unverified = (currentList ?? factors).filter(f => f.status !== 'verified')
    for (const f of unverified) {
      try { await supabase.auth.mfa.unenroll({ factorId: f.id }) } catch {}
    }
  }

  async function startEnroll() {
    setError('')
    setStartingEnroll(true)
    try {
      // refresh + cleanup
      const { data: list } = await supabase.auth.mfa.listFactors()
      const totp = list?.totp ?? []
      const verified = totp.find(f => f.status === 'verified')
      if (verified) {
        setFactors(totp)
        setStartingEnroll(false)
        return
      }
      await cleanupUnverified(totp)

      const friendlyName = `Chanthasy-${Date.now()}`
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName })
      if (err) throw err
      if (!data?.totp?.qr_code) throw new Error('Supabase ไม่ได้ส่ง QR Code กลับ — อาจปิด TOTP MFA ไว้')

      setEnrolling({
        factorId: data.id,
        qr:       data.totp.qr_code,
        secret:   data.totp.secret,
        uri:      data.totp.uri,
      })
    } catch (err) {
      console.error('MFA enroll error:', err)
      setError(`เปิด 2FA ไม่สำเร็จ: ${userMessage(err)} (${err.message || err.code || 'unknown'})`)
    } finally {
      setStartingEnroll(false)
    }
  }

  async function verifyEnroll() {
    setError('')
    if (!enrolling?.factorId || code.length !== 6) {
      setError('กรุณากรอกรหัส 6 หลักจากแอป Authenticator')
      return
    }
    setVerifying(true)
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId })
      if (chErr) throw chErr
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enrolling.factorId,
        challengeId: ch.id,
        code,
      })
      if (vErr) throw vErr
      toast.success('เปิด 2FA สำเร็จ ครั้งต่อไปจะต้องใช้แอป Authenticator')
      setEnrolling(null)
      setCode('')
      loadFactors()
    } catch (err) {
      console.error('MFA verify error:', err)
      setError(`รหัสไม่ถูกต้อง: ${userMessage(err)}`)
    } finally {
      setVerifying(false)
    }
  }

  async function cancelEnroll() {
    if (enrolling?.factorId) {
      try { await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId }) } catch {}
    }
    setEnrolling(null)
    setCode('')
    setError('')
  }

  async function removeFactor(factorId) {
    if (!confirm('แน่ใจหรือว่าต้องการปิดการยืนยัน 2 ขั้นตอน?')) return
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId })
    if (err) {
      setError(`ปิด 2FA ไม่สำเร็จ: ${userMessage(err)}`)
      return
    }
    toast.success('ปิด 2FA สำเร็จ')
    loadFactors()
  }

  if (loading) return <div style={{ padding: 16 }}><Spinner size={20} /></div>

  const activeFactor = factors.find(f => f.status === 'verified')

  return (
    <div>
      {error && (
        <div className="login-error" style={{ marginBottom: 12 }}>
          <I.Warning size={13} /> {error}
        </div>
      )}

      {activeFactor ? (
        <div style={{ background: 'var(--accent-soft)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--accent-ink)' }}>✅ เปิดใช้งาน 2FA แล้ว</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                บัญชีของคุณปลอดภัยมากขึ้น — ต้องใช้รหัสจากแอป Authenticator ทุกครั้งที่เข้าสู่ระบบ
              </div>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--danger-ink)', flexShrink: 0 }} onClick={() => removeFactor(activeFactor.id)}>
              ปิด 2FA
            </button>
          </div>
        </div>
      ) : enrolling?.qr ? (
        <div>
          <p className="settings-hint" style={{ marginBottom: 12 }}>
            1. เปิดแอป Authenticator (Google Authenticator, Authy, 1Password ฯลฯ)<br />
            2. สแกน QR Code หรือกรอก secret manually<br />
            3. กรอกรหัส 6 หลักที่ได้
          </p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ background: '#fff', padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
              <img src={enrolling.qr} alt="QR Code 2FA" style={{ width: 160, height: 160, display: 'block' }} onError={() => setError('แสดง QR ไม่ได้ — ใช้ secret manually ใต้นี้แทน')} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Secret (กรณีสแกนไม่ได้)</div>
              <code style={{ fontSize: 11, wordBreak: 'break-all', background: 'var(--bg)', padding: '6px 8px', borderRadius: 6, display: 'block', marginBottom: 12 }}>
                {enrolling.secret}
              </code>
              <input
                type="text"
                placeholder="รหัส 6 หลัก"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                style={{ fontSize: 18, letterSpacing: 4, textAlign: 'center', fontFamily: 'monospace' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-ghost" onClick={cancelEnroll} disabled={verifying}>ยกเลิก</button>
                <button className="btn btn-primary" onClick={verifyEnroll} disabled={verifying || code.length !== 6} style={{ flex: 1, justifyContent: 'center' }}>
                  {verifying ? <Spinner size={14} color="#fff" /> : 'ยืนยัน'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <p className="settings-hint">
            เพิ่มชั้นความปลอดภัยให้บัญชี — ใช้แอป Authenticator (เช่น Google Authenticator) เพื่อสร้างรหัส 6 หลักทุกครั้งที่เข้าสู่ระบบ
          </p>
          {factors.filter(f => f.status !== 'verified').length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              พบ factor ค้าง {factors.filter(f => f.status !== 'verified').length} ตัว — จะถูกลบอัตโนมัติเมื่อกดตั้งค่าใหม่
            </div>
          )}
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={startEnroll} disabled={startingEnroll}>
            {startingEnroll ? <Spinner size={13} color="#fff" /> : <><I.Lock size={13} /> ตั้งค่า 2FA</>}
          </button>
        </div>
      )}
    </div>
  )
}
