import React from 'react'
import { NavLink, Link } from 'react-router-dom'
import * as I from '../components/Icons'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../i18n'
import { membershipRoleLabel } from '../lib/perms'

const SECTIONS = [
  {
    labelKey: null,
    items: [
      { to: '/', key: 'dashboard', Icon: I.Dashboard, end: true },
    ],
  },
  {
    labelKey: 'section_stock',
    items: [
      { to: '/stock',       key: 'stock',        Icon: I.Box },
      { to: '/low',         key: 'low',          Icon: I.Alert,   alert: true },
      { to: '/movements',   key: 'movements',    Icon: I.History },
      { to: '/categories',  key: 'categories',   Icon: I.Tag },
    ],
  },
  {
    labelKey: 'section_partners',
    items: [
      { to: '/suppliers',   key: 'suppliers',    Icon: I.Truck },
      { to: '/customers',   key: 'customers',    Icon: I.User },
    ],
  },
  {
    labelKey: 'section_operations',
    items: [
      { to: '/purchase-orders', key: 'purchase_orders', Icon: I.Truck, perm: 'perm_receive' },
      { to: '/calendar',        key: 'calendar',        Icon: I.Calendar },
    ],
  },
  {
    labelKey: 'section_finance',
    items: [
      { to: '/finance',    key: 'finance',    Icon: I.Wallet },
      { to: '/settlement', key: 'settlement', Icon: I.Lock,    perm: 'perm_settle' },
      { to: '/reports',    key: 'reports',    Icon: I.Chart },
    ],
  },
  {
    labelKey: 'section_system',
    items: [
      { to: '/settings',   key: 'settings',   Icon: I.Gear },
    ],
  },
]

export default function Sidebar({ open, lowCount, onClose }) {
  const { profile, logout, perms, isSuperAdmin, stores, currentStoreId } = useAuth()
  const t = useT()
  const currentStore = stores.find(s => s.id === currentStoreId)
  const user = profile ?? { name: 'ผู้ใช้', initials: 'UU' }
  const roleLabel = membershipRoleLabel({ isSuperAdmin, currentStore })
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
        {SECTIONS.map((section) => (
          <div key={section.labelKey || 'dashboard'} className="nav-group">
            {section.labelKey && <div className="nav-section-label">{t(`nav.${section.labelKey}`)}</div>}
            {section.items.map(({ to, key, Icon, end, alert, perm }) => {
              if (perm && !isSuperAdmin && !perms?.[perm]) return null
              return (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Icon size={15} />
                  <span>{t(`nav.${key}`)}</span>
                  {alert && lowCount > 0 && (
                    <span className="nav-count" style={{ color: 'var(--amber-ink)', background: 'var(--amber-soft)' }}>
                      {lowCount}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </div>
        ))}

        {(isSuperAdmin || (isSuperAdmin || stores.some(s => s.role === 'store_admin'))) && (
          <div className="nav-group" style={{ marginTop: 8 }}>
            {isSuperAdmin && (
              <NavLink to="/admin" onClick={onClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <I.Gear size={15} />
                <span>{t('nav.admin_panel')}</span>
              </NavLink>
            )}
            {(isSuperAdmin || stores.some(s => s.role === 'store_admin')) && (
              <NavLink to="/audit" onClick={onClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <I.History size={15} />
                <span>{t('nav.audit_log')}</span>
              </NavLink>
            )}
          </div>
        )}
      </nav>
      <div style={{ display: 'flex', gap: 12, padding: '6px 16px 4px', fontSize: 11, color: 'var(--muted)' }}>
        <Link to="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }} onClick={onClose}>{t('nav.terms')}</Link>
        <Link to="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }} onClick={onClose}>{t('nav.privacy')}</Link>
      </div>

      <div className="sidebar-footer">
        <div className="avatar">{user.initials?.slice(0, 2) || '??'}</div>
        <div className="sidebar-user">
          <div className="user-name">{user.name}</div>
          <div className="user-role">{roleLabel}</div>
        </div>
        <button className="icon-btn" title={t('nav.logout')} onClick={logout} style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <I.LogOut size={14} />
        </button>
      </div>
    </aside>
  )
}
