import React, { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { statusOf } from '../lib/utils'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileNav from './MobileNav'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showNotif, setShowNotif]   = useState(false)
  const [lowPlants, setLowPlants]   = useState([])

  useEffect(() => {
    fetchLow()
    const ch = supabase.channel('layout-plants')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plants' }, fetchLow)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  async function fetchLow() {
    const { data } = await supabase.from('plants').select('id,name,stock,min_stock')
    const low = (data ?? []).filter(p => statusOf(p) !== 'ok')
    setLowPlants(low)
  }

  const notifications = lowPlants.map(p => ({
    type: p.stock <= 0 ? 'out' : 'low',
    name: p.name,
    sub: p.stock <= 0 ? 'หมดสต็อก' : `เหลือ ${p.stock} / ขั้นต่ำ ${p.min_stock}`,
  }))

  return (
    <div className="shell">
      {/* Overlay backdrop (mobile) */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <Sidebar
        lowCount={lowPlants.length}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="main">
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
    </div>
  )
}
