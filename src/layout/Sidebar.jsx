import React from 'react'
import { NavLink, Link } from 'react-router-dom'
import * as I from '../components/Icons'
import { useAuth } from '../contexts/AuthContext'

const NAV = [
  { to: '/',           label: 'แดชบอร์ด',        Icon: I.Dashboard, end: true },
  { to: '/stock',      label: 'รายการสต็อก',      Icon: I.Box },
  { to: '/low',        label: 'แจ้งเตือนสต็อก',   Icon: I.Alert,   alert: true },
  { to: '/movements',  label: 'ประวัติเคลื่อนไหว', Icon: I.History },
  { to: '/categories', label: 'หมวดหมู่',          Icon: I.Tag },
  { to: '/suppliers',  label: 'ซัพพลายเออร์',      Icon: I.Truck },
]
const SYSTEM = [
  { to: '/finance',    label: 'การเงิน',     Icon: I.Wallet },
  { to: '/settlement', label: 'ปิดยอด',     Icon: I.Lock,   perm: 'perm_settle' },
  { to: '/calendar',   label: 'ปฏิทิน',     Icon: I.Calendar },
  { to: '/reports',    label: 'รายงาน',     Icon: I.Chart },
  { to: '/settings',   label: 'ตั้งค่า',    Icon: I.Gear },
]

export default function Sidebar({ open, lowCount, onClose }) {
  const { profile, logout, perms, isSuperAdmin, stores, currentStoreId } = useAuth()
  const currentStore = stores.find(s => s.id === currentStoreId)
  const user = profile ?? { name: 'ผู้ใช้', initials: 'UU' }
  const roleLabel = isSuperAdmin
    ? 'Super Admin'
    : currentStore?.role === 'store_admin'
      ? 'Store Admin'
      : currentStore?.role === 'viewer'
        ? 'Viewer'
        : 'Staff'
  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <button className="sidebar-close icon-btn" onClick={onClose} aria-label="ปิดเมนู">
        <I.X size={16} />
      </button>

      <div className="brand">
        <div className="brand-mark">CS</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="brand-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentStore?.name || 'My Shop'}
          </div>
          <div className="brand-sub">Chanthasy Stock</div>
        </div>
      </div>

      <nav className="nav" onClick={onClose}>
        <div className="nav-section-label">ทั่วไป</div>
        {NAV.map(({ to, label, Icon, end, alert }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={15} />
            <span>{label}</span>
            {alert && lowCount > 0 && (
              <span className="nav-count" style={{ color: 'var(--amber-ink)', background: 'var(--amber-soft)' }}>
                {lowCount}
              </span>
            )}
          </NavLink>
        ))}
        <div className="nav-section-label">ระบบ</div>
        {SYSTEM.map(({ to, label, Icon, perm }) => {
          if (perm && !isSuperAdmin && !perms?.[perm]) return null
          return (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={15} />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </nav>

      {isSuperAdmin && (
        <NavLink to="/admin" onClick={onClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ margin: '0 8px 4px' }}>
          <I.Gear size={15} />
          <span>Admin Panel</span>
        </NavLink>
      )}
      <div style={{ display: 'flex', gap: 12, padding: '6px 16px 4px', fontSize: 11, color: 'var(--muted)' }}>
        <Link to="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }} onClick={onClose}>ข้อกำหนด</Link>
        <Link to="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }} onClick={onClose}>นโยบาย</Link>
      </div>

      <div className="sidebar-footer">
        <div className="avatar">{user.initials?.slice(0, 2) || '??'}</div>
        <div className="sidebar-user">
          <div className="user-name">{user.name}</div>
          <div className="user-role">{roleLabel}</div>
        </div>
        <button className="icon-btn" title="ออกจากระบบ" onClick={logout} style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <I.LogOut size={14} />
        </button>
      </div>
    </aside>
  )
}
