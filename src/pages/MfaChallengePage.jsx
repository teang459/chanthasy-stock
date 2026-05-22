import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { userMessage } from '../lib/errors'
import * as I from '../components/Icons'
import Spinner from '../components/Spinner'

export default function MfaChallengePage() {
  const { clearMfaRequired, logout } = useAuth()
  const [factorId, setFactorId] = useState(null)
  const [code, setCode]         = useState('')
  const [loading, setLoading]   = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = data?.totp?.find(f => f.status === 'verified')
      if (totp) setFactorId(totp.id)
      setLoading(false)
    })
  }, [])

  async function handleVerify(e) {
    e.preventDefault()
    if (code.length !== 6) { setError('กรอกรหัส 6 หลัก'); return }
    setError('')
    setVerifying(true)
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr) throw chErr
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code })
      if (vErr) throw vErr
      clearMfaRequired()
    } catch (err) {
      setError(userMessage(err))
      setVerifying(false)
    }
  }

  if (loading) return <div className="fullscreen-center"><Spinner size={36} /></div>

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark" style={{ width: 48, height: 48, fontSize: 20 }}>🔐</div>
          <div>
            <div className="brand-name" style={{ fontSize: 20 }}>การยืนยัน 2 ขั้นตอน</div>
            <div className="brand-sub">กรอกรหัสจาก Authenticator</div>
          </div>
        </div>

        <form onSubmit={handleVerify} noValidate>
          <div className="field">
            <span className="field-label">รหัส 6 หลัก</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
              style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center', fontFamily: 'monospace' }}
              placeholder="000000"
            />
          </div>

          {error && (
            <div className="login-error">
              <I.Warning size={13} /> {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary"
            style={{ width: '100%', marginTop: 20, justifyContent: 'center', gap: 8 }}
            disabled={verifying || code.length !== 6}>
            {verifying ? <Spinner size={16} color="#fff" /> : 'ยืนยัน'}
          </button>

          <button type="button" className="btn btn-ghost"
            style={{ width: '100%', marginTop: 8, justifyContent: 'center', fontSize: 13 }}
            onClick={logout}>
            ออกจากระบบ
          </button>
        </form>
      </div>
    </div>
  )
}
