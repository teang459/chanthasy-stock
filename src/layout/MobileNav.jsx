import React from 'react'
import { NavLink } from 'react-router-dom'
import * as I from '../components/Icons'

const ITEMS = [
  { to: '/',          label: 'หน้าหลัก',  Icon: I.Dashboard, end: true },
  { to: '/stock',     label: 'สต็อก',    Icon: I.Box },
  { to: '/low',       label: 'แจ้งเตือน', Icon: I.Alert },
  { to: '/calendar',  label: 'ปฏิทิน',   Icon: I.Calendar },
  { to: '/settings',  label: 'ตั้งค่า',   Icon: I.Gear },
]

export default function MobileNav({ lowCount }) {
  return (
    <nav className="mobile-nav" aria-label="เมนูมือถือ">
      {ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <div className="mobile-nav-icon-wrap">
            <Icon size={20} />
            {label === 'แจ้งเตือน' && lowCount > 0 && (
              <span className="mobile-badge">{lowCount}</span>
            )}
          </div>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
