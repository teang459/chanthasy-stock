import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const [adminViewingOwnerId, setAdminViewingOwnerId] = useState(null)
  const [mfaRequired, setMfaRequired] = useState(false)

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        fetchProfile(u.id)
        // Check if user has unverified MFA challenges pending
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') setMfaRequired(true)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') setIsRecoveryMode(true)
      if (_event === 'MFA_CHALLENGE_VERIFIED') setMfaRequired(false)
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        fetchProfile(u.id)
        if (_event === 'SIGNED_IN') {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          setMfaRequired(aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2')
        }
      } else {
        setProfile(null); setAdminViewingOwnerId(null); setMfaRequired(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function logout() {
    setAdminViewingOwnerId(null)
    setIsRecoveryMode(false)
    setMfaRequired(false)
    await supabase.auth.signOut()
  }

  function clearMfaRequired() {
    setMfaRequired(false)
  }

  async function updateProfile(updates) {
    if (!user) return
    const { data, error } = await supabase.from('profiles').update(updates).eq('id', user.id).select().single()
    if (!error) setProfile(data)
    return { data, error }
  }

  async function changePassword(newPassword) {
    return supabase.auth.updateUser({ password: newPassword })
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  function clearRecoveryMode() {
    setIsRecoveryMode(false)
  }

  const isAdmin = profile?.role === 'admin'
  const ownerId = (isAdmin && adminViewingOwnerId) ? adminViewingOwnerId : (profile?.manager_id ?? user?.id)

  return (
    <AuthContext.Provider value={{
      user, profile, loading, login, logout, updateProfile, changePassword, refreshProfile,
      ownerId, isRecoveryMode, clearRecoveryMode,
      mfaRequired, clearMfaRequired,
      adminViewingOwnerId, setAdminViewingOwnerId, isAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
