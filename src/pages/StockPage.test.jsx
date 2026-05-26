import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { makeSupabaseMock, makeAuthValue } from '../test/supabase-mock'
import { NO_PERMS } from '../lib/perms'

const h = vi.hoisted(() => ({ supabase: null, authValue: null }))

vi.mock('../lib/supabase',           () => ({ get supabase() { return h.supabase } }))
vi.mock('../contexts/AuthContext',   () => ({ useAuth: () => h.authValue }))
vi.mock('../contexts/ToastContext',  () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }),
}))
vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({ symbol: '฿', currency: 'THB' }),
}))
vi.mock('../i18n', () => ({
  useT: () => (key, params) => {
    const translations = {
      'stock.page_title': 'รายการสต็อก',
      'common.loading': 'กำลังโหลด...',
      'common.items': 'รายการ',
      'common.export': 'ส่งออก',
      'stock.import_csv': 'นำเข้า CSV',
      'stock.add_plant': 'เพิ่มต้นไม้',
      'stock.search_placeholder': 'ค้นหา SKU, ชื่อ…',
      'stock.scan': 'สแกน',
      'stock.cat_all': 'ทุกหมวดหมู่',
      'stock.empty_title': 'ไม่พบรายการ',
      'stock.empty_desc_search': 'ลองเปลี่ยนคำค้นหา',
      'stock.empty_desc_first': 'เริ่มเพิ่มต้นไม้รายการแรก',
      'common.back': 'ย้อนกลับ',
      'common.next': 'ถัดไป',
      'common.adjust': 'ปรับสต็อก',
      'common.edit': 'แก้ไข',
      'common.delete': 'ลบ',
    }
    return translations[key] || key
  },
}))

import StockPage from './StockPage'

const PLANTS = [
  { id: 'p1', store_id: 's1', sku: 'ROSE-01', name: 'Rose Damascena',
    stock: 10, min_stock: 5, price: 150, cost: 80, image_url: null,
    categories: null, suppliers: null },
  { id: 'p2', store_id: 's1', sku: 'KUL-01', name: 'Kularb',
    stock: 0, min_stock: 5, price: 100, cost: 50,
    categories: null, suppliers: null },
]

function setup({ perms = makeAuthValue().perms } = {}) {
  h.supabase = makeSupabaseMock({
    plants: PLANTS,
    categories: [],
    suppliers: [],
    customers: [],
  })
  h.authValue = makeAuthValue({
    ownerId: 's1',
    currentStoreId: 's1',
    stores: [{ id: 's1', name: 'Wattason', perms, role: 'store_admin' }],
    perms,
  })
  return render(<MemoryRouter><StockPage /></MemoryRouter>)
}

describe('StockPage permission gates', () => {
  beforeEach(() => { h.supabase = null; h.authValue = null })

  it('renders the plant table once data loads', async () => {
    setup()
    await waitFor(() => {
      expect(screen.getByText('Rose Damascena')).toBeInTheDocument()
      expect(screen.getByText('Kularb')).toBeInTheDocument()
    })
  })

  it('hides "เพิ่มต้นไม้" + "นำเข้า CSV" when perm_manage_plants is false', async () => {
    setup({ perms: { ...NO_PERMS, perm_sell: true, perm_receive: true } })
    await waitFor(() => expect(screen.getByText('Rose Damascena')).toBeInTheDocument())
    expect(screen.queryByText(/เพิ่มต้นไม้/)).not.toBeInTheDocument()
    expect(screen.queryByText(/นำเข้า CSV/)).not.toBeInTheDocument()
  })

  it('shows "เพิ่มต้นไม้" when perm_manage_plants is true', async () => {
    setup({ perms: { ...NO_PERMS, perm_manage_plants: true } })
    await waitFor(() => expect(screen.getByText('Rose Damascena')).toBeInTheDocument())
    expect(screen.getByText(/เพิ่มต้นไม้/)).toBeInTheDocument()
  })

  it('hides the adjust + edit + trash row buttons when neither sell/receive/adjust/manage perms are held', async () => {
    setup({ perms: NO_PERMS })
    await waitFor(() => expect(screen.getByText('Rose Damascena')).toBeInTheDocument())
    expect(screen.queryByTitle('ปรับสต็อก')).not.toBeInTheDocument()
    expect(screen.queryByTitle('แก้ไข')).not.toBeInTheDocument()
    expect(screen.queryByTitle('ลบ')).not.toBeInTheDocument()
  })

  it('shows the adjust button when any of sell/receive/adjust perms is granted', async () => {
    setup({ perms: { ...NO_PERMS, perm_sell: true } })
    await waitFor(() => expect(screen.getByText('Rose Damascena')).toBeInTheDocument())
    // one per row
    expect(screen.getAllByTitle('ปรับสต็อก').length).toBe(PLANTS.length)
  })
})

describe('StockPage search filter', () => {
  beforeEach(() => { h.supabase = null; h.authValue = null })

  it('narrows the visible plant rows as the user types', async () => {
    const user = userEvent.setup()
    setup()
    await waitFor(() => expect(screen.getByText('Rose Damascena')).toBeInTheDocument())

    const search = screen.getByPlaceholderText(/ค้นหา SKU/)
    await user.type(search, 'rose')

    expect(screen.getByText('Rose Damascena')).toBeInTheDocument()
    expect(screen.queryByText('Kularb')).not.toBeInTheDocument()
  })

  it('clears the filter when the X button is clicked', async () => {
    const user = userEvent.setup()
    setup()
    await waitFor(() => expect(screen.getByText('Rose Damascena')).toBeInTheDocument())

    const search = screen.getByPlaceholderText(/ค้นหา SKU/)
    await user.type(search, 'kularb')
    expect(screen.queryByText('Rose Damascena')).not.toBeInTheDocument()

    // clear button is rendered when search has content
    const wrap = search.closest('.search-wrap')
    const clearBtn = within(wrap).getByRole('button')
    await user.click(clearBtn)
    expect(screen.getByText('Rose Damascena')).toBeInTheDocument()
  })
})
