import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import * as I from '../components/Icons'
import Spinner from '../components/Spinner'

export default function ResetPasswordPage() {
  const { isRecoveryMode, clearRecoveryMode } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!isRecoveryMode) navigate('/login', { replace: true })
  }, [isRecoveryMode])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return }
    if (password !== confirm) { setError('รหัสผ่านไม่ตรงกัน'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) { setError(err.message); return }
    clearRecoveryMode()
    setDone(true)
    setTimeout(() => navigate('/', { replace: true }), 2000)
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark" style={{ width: 48, height: 48, fontSize: 20 }}>CS</div>
          <div>
            <div className="brand-name" style={{ fontSize: 20 }}>Chanthasy</div>
            <div className="brand-sub">ตั้งรหัสผ่านใหม่</div>
          </div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>เปลี่ยนรหัสผ่านสำเร็จ</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>กำลังพาไปหน้าหลัก...</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <span className="field-label">รหัสผ่านใหม่</span>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoFocus
                  style={{ paddingRight: 40 }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}
                  aria-label={showPw ? 'ซ่อน' : 'แสดง'}>
                  {showPw ? <I.EyeOff size={14} /> : <I.Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <span className="field-label">ยืนยันรหัสผ่านใหม่</span>
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <div className="login-error">
                <I.Warning size={13} /> {error}
              </div>
            )}
            <button type="submit" className="btn btn-primary"
              style={{ width: '100%', marginTop: 20, justifyContent: 'center', gap: 8 }}
              disabled={loading}>
              {loading ? <Spinner size={16} color="#fff" /> : 'ตั้งรหัสผ่านใหม่'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
