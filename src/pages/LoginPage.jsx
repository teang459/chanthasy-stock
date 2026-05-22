import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import * as I from '../components/Icons'
import Spinner from '../components/Spinner'

export default function LoginPage() {
  const { user, login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

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

        <div className="login-hint">
          <I.Info size={12} />
          <span>สร้างบัญชีผู้ใช้ได้ใน Supabase Dashboard → Authentication → Users</span>
        </div>
      </div>
    </div>
  )
}
