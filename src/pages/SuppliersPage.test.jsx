import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { makeSupabaseMock, makeAuthValue } from '../test/supabase-mock'
import { NO_PERMS } from '../lib/perms'

const h = vi.hoisted(() => ({ supabase: null, authValue: null }))

vi.mock('../lib/supabase',          () => ({ get supabase() { return h.supabase } }))
vi.mock('../contexts/AuthContext',  () => ({ useAuth: () => h.authValue }))
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }),
}))

import SuppliersPage from './SuppliersPage'

const SUPPLIERS = [
  { id: 'sup1', store_id: 's1', code: 'SUP001', name: 'Nong Farm',      contact: 'Nong', phone: '081-000-0001', email: null,             note: null },
  { id: 'sup2', store_id: 's1', code: 'SUP002', name: 'Mae Lek Supply', contact: null,   phone: null,          email: 'ml@example.com', note: null },
]

function setup({ perms = makeAuthValue().perms } = {}) {
  h.supabase = makeSupabaseMock({ suppliers: SUPPLIERS, plants: [] })
  h.authValue = makeAuthValue({ ownerId: 's1', currentStoreId: 's1', perms })
  return render(<MemoryRouter><SuppliersPage /></MemoryRouter>)
}

describe('SuppliersPage data loading', () => {
  beforeEach(() => { h.supabase = null; h.authValue = null })

  it('renders both supplier rows once data loads', async () => {
    setup()
    await waitFor(() => {
      expect(screen.getByText('Nong Farm')).toBeInTheDocument()
      expect(screen.getByText('Mae Lek Supply')).toBeInTheDocument()
    })
  })

  it('shows the supplier count in the page subtitle', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('Nong Farm')).toBeInTheDocument())
    expect(screen.getByText(`${SUPPLIERS.length} ราย`)).toBeInTheDocument()
  })
})

describe('SuppliersPage permission gates', () => {
  beforeEach(() => { h.supabase = null; h.authValue = null })

  it('shows "เพิ่มซัพพลายเออร์" header button when perm_manage_plants is true', async () => {
    setup({ perms: { ...NO_PERMS, perm_manage_plants: true } })
    await waitFor(() => expect(screen.getByText('Nong Farm')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /เพิ่มซัพพลายเออร์/ })).toBeInTheDocument()
  })

  it('hides "เพิ่มซัพพลายเออร์" header button when perm_manage_plants is false', async () => {
    setup({ perms: NO_PERMS })
    await waitFor(() => expect(screen.getByText('Nong Farm')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /เพิ่มซัพพลายเออร์/ })).not.toBeInTheDocument()
  })

  it('shows edit and delete row buttons when perm_manage_plants is true', async () => {
    setup({ perms: { ...NO_PERMS, perm_manage_plants: true } })
    await waitFor(() => expect(screen.getByText('Nong Farm')).toBeInTheDocument())
    expect(screen.getAllByTitle('แก้ไข').length).toBe(SUPPLIERS.length)
    expect(screen.getAllByTitle('ลบ').length).toBe(SUPPLIERS.length)
  })

  it('hides edit and delete row buttons when perm_manage_plants is false', async () => {
    setup({ perms: NO_PERMS })
    await waitFor(() => expect(screen.getByText('Nong Farm')).toBeInTheDocument())
    expect(screen.queryByTitle('แก้ไข')).not.toBeInTheDocument()
    expect(screen.queryByTitle('ลบ')).not.toBeInTheDocument()
  })
})

describe('SuppliersPage search filter', () => {
  beforeEach(() => { h.supabase = null; h.authValue = null })

  it('narrows visible rows as the user types', async () => {
    const user = userEvent.setup()
    setup()
    await waitFor(() => expect(screen.getByText('Nong Farm')).toBeInTheDocument())

    const search = screen.getByPlaceholderText(/ค้นหา/)
    await user.type(search, 'mae')

    expect(screen.getByText('Mae Lek Supply')).toBeInTheDocument()
    expect(screen.queryByText('Nong Farm')).not.toBeInTheDocument()
  })

  it('restores all rows when search is cleared', async () => {
    const user = userEvent.setup()
    setup()
    await waitFor(() => expect(screen.getByText('Nong Farm')).toBeInTheDocument())

    const search = screen.getByPlaceholderText(/ค้นหา/)
    await user.type(search, 'mae')
    expect(screen.queryByText('Nong Farm')).not.toBeInTheDocument()

    const clearBtn = search.closest('.search-wrap').querySelector('button')
    await user.click(clearBtn)

    expect(screen.getByText('Nong Farm')).toBeInTheDocument()
    expect(screen.getByText('Mae Lek Supply')).toBeInTheDocument()
  })
})
