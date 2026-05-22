import React, { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import * as I from '../components/Icons'
import Spinner from '../components/Spinner'

export default function SignUpPage() {
  const { user } = useAuth()
  const [email, setEmail]     = useState('')
  const [password, setPass]   = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim())       { setError('กรุณาระบุอีเมล'); return }
    if (password.length < 6) { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return }
    if (password !== confirm) { setError('รหัสผ่านไม่ตรงกัน'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: 'https://teang459.github.io/chanthasy-stock' },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <div className="brand-mark" style={{ width: 48, height: 48, fontSize: 20 }}>CS</div>
            <div>
              <div className="brand-name" style={{ fontSize: 20 }}>Chanthasy</div>
              <div className="brand-sub">สมัครใช้งานสำเร็จ</div>
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>ตรวจสอบอีเมลของคุณ</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              ส่งลิงก์ยืนยันไปที่ <strong>{email}</strong> แล้ว<br />
              คลิกลิงก์ในอีเมลเพื่อเปิดใช้งานบัญชี
            </div>
            <Link to="/login">
              <button className="btn btn-primary" style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}>
                กลับไปหน้าเข้าสู่ระบบ
              </button>
            </Link>
          </div>
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
            <div className="brand-sub">สมัครใช้งาน</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <span className="field-label">อีเมล</span>
            <input
              type="email"
              placeholder="you@example.com"
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
                placeholder="อย่างน้อย 6 ตัวอักษร"
                value={password}
                onChange={e => setPass(e.target.value)}
                autoComplete="new-password"
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

          <div className="field" style={{ marginTop: 12 }}>
            <span className="field-label">ยืนยันรหัสผ่าน</span>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="พิมพ์รหัสผ่านอีกครั้ง"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="login-error">
              <I.Warning size={13} /> {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 20, justifyContent: 'center', gap: 8 }} disabled={loading}>
            {loading ? <Spinner size={16} color="#fff" /> : 'สมัครใช้งาน'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>มีบัญชีอยู่แล้ว? </span>
          <Link to="/login" style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  )
}
