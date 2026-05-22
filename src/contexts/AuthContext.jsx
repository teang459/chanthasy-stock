import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]                                   = useState(null)
  const [profile, setProfile]                             = useState(null)
  const [loading, setLoading]                             = useState(true)
  const [isRecoveryMode, setIsRecoveryMode]               = useState(false)
  const [adminViewingOwnerId, setAdminViewingOwnerId]     = useState(null)
  const [mfaRequired, setMfaRequired]                     = useState(false)

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
  }

  // Resolve session + check MFA + load profile atomically so the UI never
  // shows the dashboard during a partially-resolved state.
  async function processSession(session) {
    const u = session?.user ?? null
    if (u) {
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        setMfaRequired(aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2')
      } catch (err) {
        console.warn('AAL check failed (non-fatal):', err)
        setMfaRequired(false)
      }
    } else {
      setMfaRequired(false)
    }
    setUser(u)
    if (u) fetchProfile(u.id)
    else { setProfile(null); setAdminViewingOwnerId(null) }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await processSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY')        setIsRecoveryMode(true)
      if (event === 'MFA_CHALLENGE_VERIFIED')   setMfaRequired(false)
      if (event === 'SIGNED_OUT') {
        setUser(null); setProfile(null); setAdminViewingOwnerId(null); setMfaRequired(false); setIsRecoveryMode(false)
        return
      }
      if (event === 'SIGNED_IN') {
        // Hold loading during MFA check to prevent dashboard flash
        setLoading(true)
        await processSession(session)
        setLoading(false)
        return
      }
      // TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION — update user quietly
      const u = session?.user ?? null
      setUser(u)
      if (u && !profile) fetchProfile(u.id)
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function clearRecoveryMode() { setIsRecoveryMode(false) }
  function clearMfaRequired()  { setMfaRequired(false) }

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
