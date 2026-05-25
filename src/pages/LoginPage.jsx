import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { userMessage } from '../lib/errors'
import * as I from '../components/Icons'
import Spinner from '../components/Spinner'

export default function LoginPage() {
  const { user, login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const [resetMode, setResetMode]   = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetDone, setResetDone]   = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('กรุณาระบุอีเมล'); return }
    if (!password)     { setError('กรุณาระบุรหัสผ่าน'); return }
    setLoading(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    if (!resetEmail.trim()) return
    setResetLoading(true)
    // Keep the deploy's base path (e.g. /chanthasy-stock/) so HashRouter
    // can pick up the PASSWORD_RECOVERY hash and route to /reset-password.
    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo,
    })
    setResetLoading(false)
    if (err) {
      setError(userMessage(err))
    } else {
      setResetDone(true)
    }
  }

  if (resetMode) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <div className="brand-mark" style={{ width: 48, height: 48, fontSize: 20 }}>CS</div>
            <div>
              <div className="brand-name" style={{ fontSize: 20 }}>Chanthasy</div>
              <div className="brand-sub">รีเซ็ตรหัสผ่าน</div>
            </div>
          </div>

          {resetDone ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>ส่งลิงก์แล้ว</div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                ตรวจสอบอีเมล <strong>{resetEmail}</strong> แล้วคลิกลิงก์เพื่อตั้งรหัสผ่านใหม่
              </div>
              <button
                className="btn btn-ghost"
                style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}
                onClick={() => { setResetMode(false); setResetDone(false); setError('') }}
              >
                กลับไปหน้าเข้าสู่ระบบ
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset} noValidate>
              <div className="field">
                <span className="field-label">อีเมล</span>
                <input
                  type="email"
                  placeholder="admin@chanthasy.com"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {error && (
                <div className="login-error">
                  <I.Warning size={13} /> {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 20, justifyContent: 'center', gap: 8 }}
                disabled={resetLoading}
              >
                {resetLoading ? <Spinner size={16} color="#fff" /> : 'ส่งลิงก์รีเซ็ตรหัสผ่าน'}
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
                onClick={() => { setResetMode(false); setError('') }}
              >
                ยกเลิก
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark" style={{ width: 48, height: 48, fontSize: 20 }}>CS</div>
          <div>
            <div className="brand-name" style={{ fontSize: 20 }}>Chanthasy</div>
            <div className="brand-sub">ระบบจัดการสต็อกต้นไม้</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <span className="field-label">อีเมล</span>
            <input
              type="email"
              placeholder="admin@chanthasy.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <span className="field-label">รหัสผ่าน</span>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}
                aria-label={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPw ? <I.EyeOff size={14} /> : <I.Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">
              <I.Warning size={13} /> {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 20, justifyContent: 'center', gap: 8 }} disabled={loading}>
            {loading ? <Spinner size={16} color="#fff" /> : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 13, color: 'var(--muted)', padding: '4px 8px' }}
            onClick={() => { setResetMode(true); setResetEmail(email); setError('') }}
          >
            ลืมรหัสผ่าน?
          </button>
        </div>

        <div className="login-hint">
          <I.Info size={12} />
          <span>ติดต่อผู้ดูแลระบบเพื่อขอบัญชีผู้ใช้</span>
        </div>
      </div>
    </div>
  )
}
