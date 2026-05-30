import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { setSentryUser } from '../lib/sentry'
import {
  ALL_PERMS,
  isSuperAdmin as resolveSuperAdmin,
  resolvePerms,
  pickInitialStore,
} from '../lib/perms'

const AuthContext = createContext(null)

const STORE_PICK_KEY = 'cs_current_store_id'

export function AuthProvider({ children }) {
  const [user, setUser]                       = useState(null)
  const [profile, setProfile]                 = useState(null)
  const [stores, setStores]                   = useState([])         // [{ id, code, name, role, perms, ... }]
  const [currentStoreId, _setCurrentStoreId]  = useState(null)
  const [loading, setLoading]                 = useState(true)
  const [slowLoad, setSlowLoad]               = useState(false)
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

  const isSuperAdmin = useMemo(() => resolveSuperAdmin(profile), [profile])

  const perms = useMemo(
    () => resolvePerms({ isSuperAdmin, stores, currentStoreId }),
    [isSuperAdmin, stores, currentStoreId],
  )

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    return data
  }

  async function fetchStoresFor(profileRow) {
    if (!profileRow) { setStores([]); return [] }
    if (resolveSuperAdmin(profileRow)) {
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
    return pickInitialStore({
      savedId: localStorage.getItem(STORE_PICK_KEY),
      stores: list,
      profileId: profileRow?.id,
    })
  }

  async function processSession(session) {
    const u = session?.user ?? null

    const prevUserId = userIdRef.current
    const nextUserId = u?.id ?? null

    setUser(prev => (prev?.id === u?.id ? prev : u))

    if (nextUserId !== prevUserId) {
      userIdRef.current = nextUserId
      if (u) {
        // AAL only changes on sign-in / MFA enroll / MFA verify — skip
        // it on TOKEN_REFRESHED (runs ~hourly per session) to save a
        // round trip on every refresh.
        try {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          setMfaRequired(aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2')
        } catch (err) {
          console.warn('AAL check failed (non-fatal):', err)
        }
        setSentryUser({ id: u.id, email: u.email })
        const p = await fetchProfile(u.id)
        const list = await fetchStoresFor(p)
        _setCurrentStoreId(resolveInitialStore(list, p))
      } else {
        setSentryUser(null)
        setMfaRequired(false)
        setProfile(null)
        setStores([])
        _setCurrentStoreId(null)
        localStorage.removeItem(STORE_PICK_KEY)
      }
    }
  }

  useEffect(() => {
    const slowTimer = setTimeout(() => setSlowLoad(true), 8000)

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(slowTimer)
      setSlowLoad(false)
      await processSession(session)
      initialized.current = true
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY')      setIsRecoveryMode(true)
      if (event === 'MFA_CHALLENGE_VERIFIED') setMfaRequired(false)

      if (event === 'SIGNED_OUT') {
        setSentryUser(null)
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

    return () => { clearTimeout(slowTimer); subscription.unsubscribe() }
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
      user, profile, loading, slowLoad, login, logout, updateProfile, changePassword, refreshProfile,
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
