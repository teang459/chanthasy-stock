import React from 'react'
import { NavLink } from 'react-router-dom'
import * as I from '../components/Icons'
import { useT } from '../i18n'

const ITEMS = [
  { to: '/',            key: 'dashboard',        Icon: I.Dashboard, end: true },
  { to: '/stock',       key: 'stock',            Icon: I.Box },
  { to: '/low',         key: 'low',              Icon: I.Alert, alert: true },
  { to: '/purchase-orders', key: 'purchase_orders', Icon: I.Truck },
]

export default function MobileNav({ lowCount, onMenuOpen }) {
  const t = useT()

  return (
    <nav className="mobile-nav" aria-label="Mobile menu">
      {ITEMS.map(({ to, key, Icon, end, alert }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <div className="mobile-nav-icon-wrap">
            <Icon size={20} />
            {alert && lowCount > 0 && (
              <span className="mobile-badge">{lowCount}</span>
            )}
          </div>
          <span>{t(`nav.${key}`)}</span>
        </NavLink>
      ))}
      <button className="mobile-nav-item" onClick={onMenuOpen} aria-label="Menu">
        <div className="mobile-nav-icon-wrap">
          <I.Menu size={20} />
        </div>
        <span>{t('nav.menu')}</span>
      </button>
    </nav>
  )
}
