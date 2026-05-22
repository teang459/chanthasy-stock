import { describe, it, expect } from 'vitest'
import { statusOf, statusLabel, fmtCurrency, generateSKU, calDaysInMonth, calFirstDay } from './utils'

describe('statusOf', () => {
  it('returns out for empty/zero stock', () => {
    expect(statusOf({ stock: 0, min_stock: 5 })).toBe('out')
    expect(statusOf({ stock: -1, min_stock: 5 })).toBe('out')
    expect(statusOf(null)).toBe('out')
  })

  it('returns low when stock <= min_stock', () => {
    expect(statusOf({ stock: 3, min_stock: 5 })).toBe('low')
    expect(statusOf({ stock: 5, min_stock: 5 })).toBe('low')
  })

  it('returns ok when stock > min_stock', () => {
    expect(statusOf({ stock: 10, min_stock: 5 })).toBe('ok')
  })
})

describe('statusLabel', () => {
  it('localizes known statuses', () => {
    expect(statusLabel('ok')).toBe('ปกติ')
    expect(statusLabel('low')).toBe('ใกล้หมด')
    expect(statusLabel('out')).toBe('หมด')
  })

  it('passes through unknown', () => {
    expect(statusLabel('xyz')).toBe('xyz')
  })
})

describe('fmtCurrency', () => {
  it('returns dash for null/empty', () => {
    expect(fmtCurrency(null)).toBe('—')
    expect(fmtCurrency('')).toBe('—')
  })

  it('formats integer numbers', () => {
    const out = fmtCurrency(1234567)
    expect(out.replace(/[\s,]/g, '')).toBe('1234567')
  })
})

describe('generateSKU', () => {
  it('starts with default prefix', () => {
    expect(generateSKU()).toMatch(/^PLT[A-Z0-9]+$/)
  })

  it('honors custom prefix', () => {
    expect(generateSKU('XYZ')).toMatch(/^XYZ/)
  })
})

describe('calendar helpers', () => {
  it('calDaysInMonth returns 31 for Jan', () => {
    expect(calDaysInMonth(2026, 0)).toBe(31)
  })

  it('calDaysInMonth handles February leap year', () => {
    expect(calDaysInMonth(2024, 1)).toBe(29)
    expect(calDaysInMonth(2025, 1)).toBe(28)
  })

  it('calFirstDay returns weekday 0-6', () => {
    const d = calFirstDay(2026, 0)
    expect(d).toBeGreaterThanOrEqual(0)
    expect(d).toBeLessThanOrEqual(6)
  })
})
