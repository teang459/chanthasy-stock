import React, { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../i18n'
import { useToast } from '../contexts/ToastContext'
import * as I from '../components/Icons'

const PAGE_KEY = {
  '/':                 'dashboard',
  '/stock':            'stock',
  '/low':              'low',
  '/movements':        'movements',
  '/categories':       'categories',
  '/suppliers':        'suppliers',
  '/customers':        'customers',
  '/purchase-orders':  'purchase_orders',
  '/audit':            'audit_log',
  '/calendar':         'calendar',
  '/reports':          'reports',
  '/finance':          'finance',
  '/settlement':       'settlement',
  '/settings':         'settings',
  '/admin':            'admin_panel',
}

export default function Topbar({ onMenuToggle, lowCount, notifications, onNotifToggle, showNotif }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { stores, currentStoreId } = useAuth()
  const { toast } = useToast()
  const t = useT()
  const [q, setQ] = useState('')
  const inputRef = useRef()
  const here = PAGE_KEY[location.pathname] ? t(`nav.${PAGE_KEY[location.pathname]}`) : ''

  const currentStore = stores.find(s => s.id === currentStoreId)
  const shopName = currentStore?.name || 'My Shop'

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

  function handleSubmit(e) {
    e.preventDefault()
    const val = q.trim()
    if (!val) return
    if (location.pathname !== '/stock') navigate('/stock', { state: { search: val } })
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

      <form className="topbar-search" onSubmit={handleSubmit} role="search">
        <I.Search size={13} className="search-icon" />
        <input
          ref={inputRef}
          type="search"
          placeholder={t('topbar.search_placeholder')}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <span className="kbd">⌘K</span>
      </form>

      <button className="icon-btn notif-btn" onClick={onNotifToggle} aria-label={t('topbar.notifications')} style={{ position: 'relative' }}>
        <I.Bell size={15} />
        {lowCount > 0 && <span className="notif-dot" />}
      </button>

      {showNotif && (
        <div className="notif-panel" role="dialog" aria-label={t('topbar.notifications')}>
          <div className="notif-header">
            <span>{t('topbar.notifications')}</span>
            {lowCount > 0 && <span className="badge badge--low">{lowCount} {t('common.items')}</span>}
          </div>
          {notifications.length === 0 ? (
            <div className="notif-empty">{t('topbar.notifications_empty')}</div>
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
