import React from 'react'
import { NavLink } from 'react-router-dom'
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
  { to: '/calendar', label: 'ปฏิทิน',   Icon: I.Calendar },
  { to: '/reports',  label: 'รายงาน',   Icon: I.Chart },
  { to: '/settings', label: 'ตั้งค่า',  Icon: I.Gear },
]

export default function Sidebar({ open, lowCount, onClose }) {
  const { profile, logout } = useAuth()
  const user = profile ?? { name: 'ผู้ใช้', role: 'staff', initials: 'UU' }
  const shopName = profile?.shop_name?.trim() || 'My Shop'
  const shopMark = shopName.slice(0, 2).toUpperCase()

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      {/* close btn (mobile) */}
      <button className="sidebar-close icon-btn" onClick={onClose} aria-label="ปิดเมนู">
        <I.X size={16} />
      </button>

      <div className="brand">
        <div className="brand-mark">{shopMark}</div>
        <div>
          <div className="brand-name">{shopName}</div>
          <div className="brand-sub">STOCK · v3.0</div>
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
        {SYSTEM.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={15} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="avatar">{user.initials?.slice(0, 2) || '??'}</div>
        <div className="sidebar-user">
          <div className="user-name">{user.name}</div>
          <div className="user-role">{user.role === 'admin' ? 'Admin' : user.role === 'viewer' ? 'Viewer' : 'Staff'}</div>
        </div>
        <button className="icon-btn" title="ออกจากระบบ" onClick={logout} style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <I.LogOut size={14} />
        </button>
      </div>
    </aside>
  )
}
