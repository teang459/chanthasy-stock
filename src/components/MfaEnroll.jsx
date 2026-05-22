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
    setError('')
    try {
      const { data, error: err } = await supabase.auth.mfa.listFactors()
      if (err) throw err
      setFactors(data?.totp ?? [])
    } catch (err) {
      console.error('[MFA] listFactors:', err)
      setError(userMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function startEnroll() {
    setError('')
    setStartingEnroll(true)
    try {
      const { data: list, error: listErr } = await supabase.auth.mfa.listFactors()
      if (listErr) throw listErr
      const totp = list?.totp ?? []

      // If already verified, just refresh display
      const verified = totp.find(f => f.status === 'verified')
      if (verified) {
        setFactors(totp)
        setStartingEnroll(false)
        return
      }

      // Cleanup stale unverified factors
      for (const f of totp.filter(f => f.status !== 'verified')) {
        try { await supabase.auth.mfa.unenroll({ factorId: f.id }) }
        catch (e) { console.warn('[MFA] cleanup failed:', e) }
      }

      const friendlyName = `Chanthasy-${Date.now().toString(36)}`
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName })
      if (err) throw err
      if (!data?.totp?.qr_code && !data?.totp?.secret) {
        throw new Error('Supabase ไม่ได้ส่ง QR กลับ — โปรเจกต์อาจปิด TOTP MFA')
      }

      setEnrolling({
        factorId: data.id,
        qr:       data.totp.qr_code,
        secret:   data.totp.secret,
        uri:      data.totp.uri,
      })
    } catch (err) {
      console.error('[MFA] enroll:', err)
      setError(`เปิด 2FA ไม่สำเร็จ: ${userMessage(err)} — ${err.message || err.code || 'unknown'}`)
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

    // Hard timeout — never let the UI hang forever
    const withTimeout = (promise, ms, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout (${ms / 1000}s)`)), ms)),
    ])

    try {
      console.log('[MFA] step 1: challenge()…', { factorId: enrolling.factorId })
      const chResult = await withTimeout(
        supabase.auth.mfa.challenge({ factorId: enrolling.factorId }),
        10000,
        'challenge'
      )
      console.log('[MFA] challenge response:', chResult)
      if (chResult.error) throw chResult.error
      if (!chResult.data?.id) throw new Error('Challenge ID หายไป (ตอบกลับผิดรูปแบบจาก Supabase)')

      console.log('[MFA] step 2: verify()…', { factorId: enrolling.factorId, challengeId: chResult.data.id })
      const vResult = await withTimeout(
        supabase.auth.mfa.verify({
          factorId: enrolling.factorId,
          challengeId: chResult.data.id,
          code,
        }),
        10000,
        'verify'
      )
      console.log('[MFA] verify response:', vResult)
      if (vResult.error) throw vResult.error

      toast.success('เปิด 2FA สำเร็จ ครั้งต่อไปต้องใช้แอป Authenticator')
      setEnrolling(null)
      setCode('')
      await loadFactors()
    } catch (err) {
      console.error('[MFA] verify error:', err, err?.message, err?.code)
      const msg = err?.message || ''
      let display
      if (/timeout/i.test(msg)) {
        display = `เครือข่ายช้าหรือไม่ตอบกลับ: ${msg}`
      } else if (/invalid TOTP|invalid token|code/i.test(msg)) {
        display = 'รหัสไม่ถูกต้อง — ลองอีกครั้ง และตรวจให้แน่ใจว่าเวลามือถือตรง (เปิด Set Time Automatically)'
      } else {
        display = `${userMessage(err)} — ${msg || err?.code || 'unknown'}`
      }
      setError(display)
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

  function copySecret() {
    if (!enrolling?.secret) return
    navigator.clipboard?.writeText(enrolling.secret).then(
      () => toast.success('คัดลอก secret แล้ว'),
      () => toast.error('คัดลอกไม่สำเร็จ')
    )
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, color: 'var(--accent-ink)' }}>✅ เปิดใช้งาน 2FA แล้ว</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                ต้องใช้รหัสจากแอป Authenticator ทุกครั้งที่เข้าสู่ระบบ
              </div>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--danger-ink)', flexShrink: 0 }} onClick={() => removeFactor(activeFactor.id)}>
              ปิด 2FA
            </button>
          </div>
        </div>
      ) : enrolling?.qr ? (
        <div>
          <p className="settings-hint" style={{ marginBottom: 12, lineHeight: 1.7 }}>
            <strong>1.</strong> เปิดแอป Authenticator (Google Authenticator, Authy, 1Password)<br />
            <strong>2.</strong> สแกน QR Code หรือกรอก secret manually<br />
            <strong>3.</strong> กรอกรหัส 6 หลักที่ได้
          </p>
          <div className="mfa-enroll-grid">
            <div className="mfa-qr-box">
              <img src={enrolling.qr} alt="QR Code 2FA"
                style={{ width: '100%', maxWidth: 180, height: 'auto', display: 'block' }}
                onError={() => setError('แสดง QR ไม่ได้ — กรอก secret manually แทน')}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Secret (กรณีสแกนไม่ได้)</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <code style={{ fontSize: 11, wordBreak: 'break-all', background: 'var(--bg)', padding: '6px 8px', borderRadius: 6, flex: 1, fontFamily: 'monospace' }}>
                  {enrolling.secret}
                </code>
                <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={copySecret}>คัดลอก</button>
              </div>
              <input
                type="text"
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                style={{ fontSize: 20, letterSpacing: 4, textAlign: 'center', fontFamily: 'monospace' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-ghost" onClick={cancelEnroll} disabled={verifying}>ยกเลิก</button>
                <button className="btn btn-primary" onClick={verifyEnroll} disabled={verifying || code.length !== 6} style={{ flex: 1, justifyContent: 'center' }}>
                  {verifying ? <Spinner size={14} color="#fff" /> : 'ยืนยัน'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                💡 ถ้ารหัสไม่ถูกต้อง ตรวจให้แน่ใจว่าเวลาในมือถือตรงกับเวลาจริง (รหัสเปลี่ยนทุก 30 วินาที)
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <p className="settings-hint">
            เพิ่มชั้นความปลอดภัยให้บัญชี — ใช้แอป Authenticator (เช่น Google Authenticator) เพื่อสร้างรหัส 6 หลักทุกครั้งที่เข้าสู่ระบบ
          </p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={startEnroll} disabled={startingEnroll}>
            {startingEnroll ? <Spinner size={13} color="#fff" /> : <><I.Lock size={13} /> ตั้งค่า 2FA</>}
          </button>
        </div>
      )}
    </div>
  )
}
