import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { statusOf } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileNav from './MobileNav'
import OnboardingWizard from '../components/OnboardingWizard'

export default function Layout() {
  const { profile, ownerId, adminViewingOwnerId, setAdminViewingOwnerId, isAdmin,
          stores, currentStoreId, setCurrentStoreId, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showNotif, setShowNotif]     = useState(false)
  const [lowPlants, setLowPlants]     = useState([])
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [adminViewingName, setAdminViewingName] = useState('')

  useEffect(() => {
    // Trigger onboarding for a brand-new user who has no store membership yet.
    // Returning users (already members of at least one store) skip it.
    if (profile && stores.length === 0 && !localStorage.getItem('onboarding_done')) {
      setShowOnboarding(true)
    }
  }, [profile, stores.length])

  useEffect(() => {
    fetchLow()
    if (!ownerId) return
    const ch = supabase.channel(`layout-plants-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plants', filter: `store_id=eq.${ownerId}` }, fetchLow)
      .subscribe()
    return () => supabase.removeChannel(ch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId])

  useEffect(() => {
    if (!adminViewingOwnerId) { setAdminViewingName(''); return }
    const match = stores.find(s => s.id === adminViewingOwnerId)
    setAdminViewingName(match?.name || adminViewingOwnerId.slice(0, 8))
  }, [adminViewingOwnerId, stores])

  async function fetchLow() {
    if (!ownerId) { setLowPlants([]); return }
    const { data } = await supabase.from('plants').select('id,name,stock,min_stock').eq('store_id', ownerId)
    const low = (data ?? []).filter(p => statusOf(p) !== 'ok')
    setLowPlants(low)
  }

  const notifications = lowPlants.map(p => ({
    type: p.stock <= 0 ? 'out' : 'low',
    name: p.name,
    sub: p.stock <= 0 ? 'หมดสต็อก' : `เหลือ ${p.stock} / ขั้นต่ำ ${p.min_stock}`,
  }))

  function exitAdminView() {
    setAdminViewingOwnerId(null)
    navigate('/admin')
  }

  return (
    <div className="shell">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <Sidebar
        open={sidebarOpen}
        lowCount={lowPlants.length}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="main">
        {isAdmin && adminViewingOwnerId && (
          <div style={{
            background: 'oklch(55% 0.18 250)', color: '#fff',
            padding: '8px 20px', fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <span>👁 Admin — กำลังดูร้าน: <strong>{adminViewingName}</strong></span>
            <button
              onClick={exitAdminView}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              ออกจากโหมดดู
            </button>
          </div>
        )}

        {/* Store switcher: shown when the user belongs to (or can see) more than one store. */}
        {stores.length > 1 && (
          <div style={{
            background: 'var(--bg)', borderBottom: '1px solid var(--border)',
            padding: '6px 20px', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ color: 'var(--muted)' }}>สาขา:</span>
            <select
              value={currentStoreId ?? ''}
              onChange={e => setCurrentStoreId(e.target.value)}
              style={{ padding: '3px 8px', fontSize: 12, minWidth: 200 }}
            >
              {stores.map(s => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                  {isSuperAdmin && s.id !== profile?.id ? ' (admin view)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <Topbar
          onMenuToggle={() => setSidebarOpen(o => !o)}
          lowCount={lowPlants.length}
          notifications={notifications}
          onNotifToggle={() => setShowNotif(o => !o)}
          showNotif={showNotif}
        />
        <div className="content" onClick={() => setShowNotif(false)}>
          <Outlet />
        </div>
      </div>

      <MobileNav lowCount={lowPlants.length} onMenuOpen={() => setSidebarOpen(true)} />

      {showOnboarding && (
        <OnboardingWizard onDone={() => setShowOnboarding(false)} />
      )}
    </div>
  )
}
