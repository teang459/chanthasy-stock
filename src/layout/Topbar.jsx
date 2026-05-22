import React, { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import * as I from '../components/Icons'

const PAGE_NAMES = {
  '/':           'แดชบอร์ด',
  '/stock':      'รายการสต็อก',
  '/low':        'แจ้งเตือนสต็อก',
  '/movements':  'ประวัติเคลื่อนไหว',
  '/categories': 'หมวดหมู่',
  '/suppliers':  'ซัพพลายเออร์',
  '/calendar':   'ปฏิทิน',
  '/reports':    'รายงาน',
  '/finance':    'การเงิน',
  '/settings':   'ตั้งค่า',
  '/admin':      'Admin Panel',
}

export default function Topbar({ onMenuToggle, lowCount, notifications, onNotifToggle, showNotif }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, ownerId, adminViewingOwnerId, isAdmin } = useAuth()
  const { toast } = useToast()
  const [q, setQ] = useState('')
  const [viewingShopName, setViewingShopName] = useState('')
  const inputRef = useRef()
  const here = PAGE_NAMES[location.pathname] ?? 'หน้า'

  // When admin is viewing another shop, show that shop's name in the topbar
  useEffect(() => {
    if (isAdmin && adminViewingOwnerId) {
      supabase.from('profiles').select('shop_name, name').eq('id', adminViewingOwnerId).single()
        .then(({ data }) => setViewingShopName(data?.shop_name || data?.name || ''))
    } else {
      setViewingShopName('')
    }
  }, [adminViewingOwnerId, isAdmin])

  const shopName = viewingShopName || profile?.shop_name?.trim() || 'My Shop'

  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  function handleSearch(e) {
    const val = e.target.value
    setQ(val)
    if (val && location.pathname !== '/stock') navigate('/stock', { state: { search: val } })
  }

  return (
    <header className="topbar">
      <button className="icon-btn topbar-menu" onClick={onMenuToggle} aria-label="เมนู">
        <I.Menu size={16} />
      </button>

      <div className="crumbs">
        <span>Chanthasy</span>
        <I.Chevron size={12} />
        <span className="here">{here}</span>
      </div>

      {/* Mobile-only: current page name where crumbs would be */}
      <span className="topbar-page-mobile">{here}</span>

      <div className="topbar-shopname">{shopName}</div>

      <div className="topbar-search">
        <I.Search size={13} className="search-icon" />
        <input
          ref={inputRef}
          placeholder="ค้นหา SKU, ชื่อต้นไม้…"
          value={q}
          onChange={handleSearch}
        />
        <span className="kbd">⌘K</span>
      </div>

      <button className="icon-btn notif-btn" onClick={onNotifToggle} aria-label="การแจ้งเตือน" style={{ position: 'relative' }}>
        <I.Bell size={15} />
        {lowCount > 0 && <span className="notif-dot" />}
      </button>

      {showNotif && (
        <div className="notif-panel" role="dialog" aria-label="การแจ้งเตือน">
          <div className="notif-header">
            <span>การแจ้งเตือน</span>
            {lowCount > 0 && <span className="badge badge--low">{lowCount} รายการ</span>}
          </div>
          {notifications.length === 0 ? (
            <div className="notif-empty">ไม่มีการแจ้งเตือน</div>
          ) : (
            <div className="notif-list">
              {notifications.map((n, i) => (
                <div key={i} className={`notif-item notif-item--${n.type}`}>
                  <span className="notif-dot-sm" />
                  <div>
                    <div className="notif-name">{n.name}</div>
                    <div className="notif-sub">{n.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="notif-footer">
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '4px 8px' }}
              onClick={async () => {
                if (!('Notification' in window)) { toast.error('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน'); return }
                if (Notification.permission === 'granted') { toast.success('เปิดใช้งานการแจ้งเตือนอยู่แล้ว'); return }
                const p = await Notification.requestPermission()
                if (p === 'granted') toast.success('เปิดใช้งานการแจ้งเตือนสำเร็จ')
                else if (p === 'denied') toast.error('บล็อกการแจ้งเตือน — โปรดเปิดในการตั้งค่าเบราว์เซอร์')
                else toast.info('ยังไม่ได้อนุญาตการแจ้งเตือน')
              }}
            >
              {typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'การแจ้งเตือนเปิดอยู่แล้ว' : 'เปิดใช้งานการแจ้งเตือน'}
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
