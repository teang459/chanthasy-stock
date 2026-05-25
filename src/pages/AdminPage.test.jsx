import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { makeSupabaseMock, makeAuthValue } from '../test/supabase-mock'

// Hoisted holder so vi.mock factories can reach the same instance the test
// configures via beforeEach. vi.mock is hoisted above all imports so direct
// captures from the outer scope don't work otherwise.
const h = vi.hoisted(() => ({
  supabase: null,
  authValue: null,
}))

vi.mock('../lib/supabase', () => ({ get supabase() { return h.supabase } }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => h.authValue }))
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }),
}))

import AdminPage from './AdminPage'

function renderWithRouter(initialEntry = '/admin') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<div>HOME</div>} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminPage auth gate', () => {
  beforeEach(() => {
    h.supabase = makeSupabaseMock()
  })

  it('redirects non-super-admin away from the page', async () => {
    h.authValue = makeAuthValue({ isSuperAdmin: false })
    renderWithRouter()
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument())
  })

  it('shows a spinner while profile is still loading', async () => {
    h.authValue = makeAuthValue({ profile: null })
    const { container } = renderWithRouter()
    // The spinner has no accessible text, but the route did not redirect to /
    expect(screen.queryByText('HOME')).not.toBeInTheDocument()
    expect(container.querySelector('.page-center')).toBeInTheDocument()
  })
})

describe('AdminPage as super admin', () => {
  beforeEach(() => {
    h.supabase = makeSupabaseMock({
      stores: [
        { id: 's1', code: 'STR001', name: 'Wattason', currency: 'LAK', vat_rate: 0, active: true },
        { id: 's2', code: 'STR002', name: 'hoo',      currency: 'THB', vat_rate: 7, active: true, vat_inclusive: true },
      ],
      store_members: [
        { id: 'm1', store_id: 's1', user_id: 'user-1', role: 'store_admin',
          perm_sell: true, perm_receive: true, perm_adjust: true,
          perm_manage_plants: true, perm_view_reports: true, perm_finance: true, perm_settle: true },
      ],
      plants: [{ store_id: 's1' }, { store_id: 's1' }, { store_id: 's2' }],
    }, { rpc: { get_all_shops_for_admin: [
      { id: 'user-1', name: 'Me', email: 'me@example.com' },
    ] } })
    h.authValue = makeAuthValue({ isSuperAdmin: true })
  })

  it('renders the stores table with code, name, and plant count', async () => {
    renderWithRouter()
    await waitFor(() => {
      expect(screen.getByText('STR001')).toBeInTheDocument()
      expect(screen.getByText('Wattason')).toBeInTheDocument()
      expect(screen.getByText('STR002')).toBeInTheDocument()
    })
  })

  it('header summary counts members + plant rows', async () => {
    renderWithRouter()
    await waitFor(() => {
      // pattern: "2 สาขา · 1 สมาชิกรวม · 1 บัญชี"
      expect(screen.getByText(/2 สาขา/)).toBeInTheDocument()
      expect(screen.getByText(/1 สมาชิกรวม/)).toBeInTheDocument()
    })
  })
})
