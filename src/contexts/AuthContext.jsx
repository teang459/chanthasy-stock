import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const [adminViewingOwnerId, setAdminViewingOwnerId] = useState(null)

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') setIsRecoveryMode(true)
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      else { setProfile(null); setAdminViewingOwnerId(null) }
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

  function clearRecoveryMode() {
    setIsRecoveryMode(false)
  }

  const isAdmin = profile?.role === 'admin'
  const ownerId = (isAdmin && adminViewingOwnerId) ? adminViewingOwnerId : (profile?.manager_id ?? user?.id)

  return (
    <AuthContext.Provider value={{
      user, profile, loading, login, logout, updateProfile, changePassword, refreshProfile,
      ownerId, isRecoveryMode, clearRecoveryMode,
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
