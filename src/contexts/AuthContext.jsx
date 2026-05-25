import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const ALL_PERMS = Object.freeze({
  perm_sell: true,
  perm_receive: true,
  perm_adjust: true,
  perm_manage_plants: true,
  perm_view_reports: true,
  perm_finance: true,
  perm_settle: true,
})

const NO_PERMS = Object.freeze({
  perm_sell: false,
  perm_receive: false,
  perm_adjust: false,
  perm_manage_plants: false,
  perm_view_reports: false,
  perm_finance: false,
  perm_settle: false,
})

const STORE_PICK_KEY = 'cs_current_store_id'

export function AuthProvider({ children }) {
  const [user, setUser]                       = useState(null)
  const [profile, setProfile]                 = useState(null)
  const [stores, setStores]                   = useState([])         // [{ id, code, name, role, perms, ... }]
  const [currentStoreId, _setCurrentStoreId]  = useState(null)
  const [loading, setLoading]                 = useState(true)
  const [isRecoveryMode, setIsRecoveryMode]   = useState(false)
  const [mfaRequired, setMfaRequired]         = useState(false)

  // Track previous user.id to avoid unnecessary refetches on token refresh
  const userIdRef    = useRef(null)
  const initialized  = useRef(false)

  function setCurrentStoreId(id) {
    _setCurrentStoreId(id)
    if (id) localStorage.setItem(STORE_PICK_KEY, id)
    else    localStorage.removeItem(STORE_PICK_KEY)
  }

  // Legacy: existing pages read `isAdmin` to know super-admin
  // and call setAdminViewingOwnerId to scope to a tenant. We map both
  // onto the new multi-store model so older code keeps working until
  // Phase D.2 migrates every call site.
  const isSuperAdmin = useMemo(() => profile?.role === 'super_admin', [profile])

  // Perms of the current store. Super admins always have all perms.
  const perms = useMemo(() => {
    if (isSuperAdmin) return ALL_PERMS
    const s = stores.find(s => s.id === currentStoreId)
    return s?.perms ?? NO_PERMS
  }, [isSuperAdmin, stores, currentStoreId])

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    return data
  }

  async function fetchStoresFor(profileRow) {
    if (!profileRow) { setStores([]); return [] }
    if (profileRow.role === 'super_admin') {
      const { data } = await supabase.from('stores').select('*').order('code')
      const list = (data ?? []).map(s => ({ ...s, role: 'super_admin', perms: ALL_PERMS }))
      setStores(list)
      return list
    }
    const { data } = await supabase
      .from('store_members')
      .select('role, perm_sell, perm_receive, perm_adjust, perm_manage_plants, perm_view_reports, perm_finance, perm_settle, stores(*)')
      .eq('user_id', profileRow.id)
    const list = (data ?? [])
      .filter(m => m.stores)
      .map(m => ({
        ...m.stores,
        role: m.role,
        perms: {
          perm_sell: m.perm_sell,
          perm_receive: m.perm_receive,
          perm_adjust: m.perm_adjust,
          perm_manage_plants: m.perm_manage_plants,
          perm_view_reports: m.perm_view_reports,
          perm_finance: m.perm_finance,
          perm_settle: m.perm_settle,
        },
      }))
    setStores(list)
    return list
  }

  function resolveInitialStore(list, profileRow) {
    const saved = localStorage.getItem(STORE_PICK_KEY)
    if (saved && list.some(s => s.id === saved)) return saved
    // Default for a regular owner: their own store (id === profile.id)
    if (profileRow && list.some(s => s.id === profileRow.id)) return profileRow.id
    return list[0]?.id ?? null
  }

  async function processSession(session) {
    const u = session?.user ?? null
    if (u) {
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        setMfaRequired(aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2')
      } catch (err) {
        console.warn('AAL check failed (non-fatal):', err)
      }
    } else {
      setMfaRequired(false)
    }

    const prevUserId = userIdRef.current
    const nextUserId = u?.id ?? null

    setUser(prev => (prev?.id === u?.id ? prev : u))

    if (nextUserId !== prevUserId) {
      userIdRef.current = nextUserId
      if (u) {
        const p = await fetchProfile(u.id)
        const list = await fetchStoresFor(p)
        _setCurrentStoreId(resolveInitialStore(list, p))
      } else {
        setProfile(null)
        setStores([])
        _setCurrentStoreId(null)
        localStorage.removeItem(STORE_PICK_KEY)
      }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await processSession(session)
      initialized.current = true
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY')      setIsRecoveryMode(true)
      if (event === 'MFA_CHALLENGE_VERIFIED') setMfaRequired(false)

      if (event === 'SIGNED_OUT') {
        userIdRef.current = null
        setUser(null); setProfile(null); setStores([])
        _setCurrentStoreId(null)
        localStorage.removeItem(STORE_PICK_KEY)
        setMfaRequired(false); setIsRecoveryMode(false)
        return
      }

      if (!initialized.current) return
      await processSession(session)
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
    if (!user) return
    const p = await fetchProfile(user.id)
    const list = await fetchStoresFor(p)
    if (!list.some(s => s.id === currentStoreId)) {
      _setCurrentStoreId(resolveInitialStore(list, p))
    }
  }

  function clearRecoveryMode() { setIsRecoveryMode(false) }
  function clearMfaRequired()  { setMfaRequired(false) }

  // ────────────────────────────────────────────────────────────────
  // Backward-compat aliases. Existing pages use `ownerId`, `isAdmin`,
  // and `adminViewingOwnerId`. After the 1:1 owner→store backfill the
  // current store id IS the legacy owner id, so we expose it under
  // both names. setAdminViewingOwnerId becomes a thin wrapper that
  // updates the current store selection.
  // ────────────────────────────────────────────────────────────────
  const ownerId = currentStoreId
  const isAdmin = isSuperAdmin
  // Legacy semantics: null = viewing my own data, set = viewing another tenant.
  const adminViewingOwnerId =
    isSuperAdmin && currentStoreId && currentStoreId !== profile?.id
      ? currentStoreId
      : null
  function setAdminViewingOwnerId(id) {
    if (!isSuperAdmin) return
    // Clearing the override → reset to the super admin's own store.
    setCurrentStoreId(id ?? profile?.id ?? null)
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading, login, logout, updateProfile, changePassword, refreshProfile,
      isRecoveryMode, clearRecoveryMode,
      mfaRequired, clearMfaRequired,

      // New multi-store API
      stores, currentStoreId, setCurrentStoreId, perms, isSuperAdmin,

      // Legacy aliases (will be removed after Phase C cutover)
      ownerId, isAdmin, adminViewingOwnerId, setAdminViewingOwnerId,
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
