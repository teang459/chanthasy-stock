import { describe, it, expect } from 'vitest'
import { vatBreakdown, hasVat } from './vat'

describe('vatBreakdown', () => {
  it('returns the input unchanged when rate is 0', () => {
    const r = vatBreakdown(1000, { vat_rate: 0, vat_inclusive: true })
    expect(r.base).toBe(1000)
    expect(r.vat).toBe(0)
    expect(r.total).toBe(1000)
  })

  it('splits an inclusive total at 7% correctly', () => {
    const r = vatBreakdown(107, { vat_rate: 7, vat_inclusive: true })
    expect(r.total).toBe(107)
    expect(r.base).toBeCloseTo(100, 5)
    expect(r.vat).toBeCloseTo(7, 5)
  })

  it('adds VAT on top when exclusive', () => {
    const r = vatBreakdown(100, { vat_rate: 7, vat_inclusive: false })
    expect(r.base).toBe(100)
    expect(r.vat).toBeCloseTo(7, 5)
    expect(r.total).toBeCloseTo(107, 5)
  })

  it('treats missing options as no-VAT', () => {
    const r = vatBreakdown(50)
    expect(r.base).toBe(50)
    expect(r.vat).toBe(0)
    expect(r.rate).toBe(0)
  })
})

describe('hasVat', () => {
  it('detects VAT enabled', () => {
    expect(hasVat({ vat_rate: 7 })).toBe(true)
    expect(hasVat({ vat_rate: '7.00' })).toBe(true)
  })
  it('detects VAT disabled', () => {
    expect(hasVat({ vat_rate: 0 })).toBe(false)
    expect(hasVat({ vat_rate: null })).toBe(false)
    expect(hasVat(null)).toBe(false)
    expect(hasVat(undefined)).toBe(false)
  })
})
