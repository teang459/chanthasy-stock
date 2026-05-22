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
  const { profile, ownerId, adminViewingOwnerId, setAdminViewingOwnerId, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showNotif, setShowNotif]     = useState(false)
  const [lowPlants, setLowPlants]     = useState([])
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [adminViewingName, setAdminViewingName] = useState('')

  useEffect(() => {
    // Only show onboarding to team owners (no manager_id), not to staff members
    if (profile && !profile.manager_id && !profile.shop_name && !localStorage.getItem('onboarding_done')) {
      setShowOnboarding(true)
    }
  }, [profile])

  useEffect(() => {
    fetchLow()
    if (!ownerId) return
    const ch = supabase.channel(`layout-plants-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plants', filter: `owner_id=eq.${ownerId}` }, fetchLow)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [ownerId])

  useEffect(() => {
    if (adminViewingOwnerId) {
      supabase.from('profiles').select('name,shop_name').eq('id', adminViewingOwnerId).single()
        .then(({ data }) => setAdminViewingName(data?.shop_name || data?.name || adminViewingOwnerId.slice(0, 8)))
    } else {
      setAdminViewingName('')
    }
  }, [adminViewingOwnerId])

  async function fetchLow() {
    const q = supabase.from('plants').select('id,name,stock,min_stock')
    if (ownerId) q.eq('owner_id', ownerId)
    const { data } = await q
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

      <MobileNav lowCount={lowPlants.length} />

      {showOnboarding && (
        <OnboardingWizard onDone={() => setShowOnboarding(false)} />
      )}
    </div>
  )
}
