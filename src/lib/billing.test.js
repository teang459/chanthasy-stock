import { describe, it, expect } from 'vitest'
import { TIERS, TIER_ORDER, tierOf, usageRatios, fmtTHB, isOverLimit } from './billing'

describe('TIERS / TIER_ORDER', () => {
  it('defines free, pro, business', () => {
    expect(TIERS.free).toBeDefined()
    expect(TIERS.pro).toBeDefined()
    expect(TIERS.business).toBeDefined()
    expect(TIER_ORDER).toEqual(['free', 'pro', 'business'])
  })

  it('free plan has a price of 0', () => {
    expect(TIERS.free.priceTHB).toBe(0)
  })

  it('business plan has Infinity limits', () => {
    expect(TIERS.business.limits.plants).toBe(Infinity)
    expect(TIERS.business.limits.members).toBe(Infinity)
  })
})

describe('tierOf', () => {
  it('returns free tier for null/undefined subscription', () => {
    expect(tierOf(null)).toBe(TIERS.free)
    expect(tierOf(undefined)).toBe(TIERS.free)
  })

  it('returns the matching tier object', () => {
    expect(tierOf({ tier: 'free' })).toBe(TIERS.free)
    expect(tierOf({ tier: 'pro' })).toBe(TIERS.pro)
    expect(tierOf({ tier: 'business' })).toBe(TIERS.business)
  })

  it('falls back to free for unknown tier strings', () => {
    expect(tierOf({ tier: 'enterprise' })).toBe(TIERS.free)
    expect(tierOf({ tier: '' })).toBe(TIERS.free)
    expect(tierOf({ tier: null })).toBe(TIERS.free)
  })
})

describe('usageRatios', () => {
  it('returns empty object when either arg is null/undefined', () => {
    expect(usageRatios(null, {})).toEqual({})
    expect(usageRatios(TIERS.free, null)).toEqual({})
    expect(usageRatios(null, null)).toEqual({})
  })

  it('returns 0 for all keys on the business (Infinity-limit) tier', () => {
    const r = usageRatios(TIERS.business, { plants: 99999, members: 999, movements30d: 99999 })
    expect(r.plants).toBe(0)
    expect(r.members).toBe(0)
    expect(r.movements30d).toBe(0)
  })

  it('computes the right ratio for the free tier', () => {
    // free limits: plants=50, members=2, movements30d=500
    const r = usageRatios(TIERS.free, { plants: 25, members: 1, movements30d: 250 })
    expect(r.plants).toBeCloseTo(0.5, 10)
    expect(r.members).toBeCloseTo(0.5, 10)
    expect(r.movements30d).toBeCloseTo(0.5, 10)
  })

  it('clamps over-quota usage to 1.5', () => {
    const r = usageRatios(TIERS.free, { plants: 100 }) // limit = 50
    expect(r.plants).toBe(1.5)
  })

  it('treats missing usage keys as 0', () => {
    const r = usageRatios(TIERS.free, {})
    expect(r.plants).toBe(0)
    expect(r.members).toBe(0)
    expect(r.movements30d).toBe(0)
  })
})

describe('fmtTHB', () => {
  it('formats zero as "0"', () => {
    expect(fmtTHB(0)).toBe('0')
  })

  it('formats integers without decimal digits', () => {
    const out = fmtTHB(1234)
    expect(out.replace(/[^0-9]/g, '')).toBe('1234')
  })

  it('rounds decimal values', () => {
    const out = fmtTHB(99.9)
    expect(out.replace(/[^0-9]/g, '')).toBe('100')
  })

  it('handles string-coercible numbers', () => {
    expect(() => fmtTHB('500')).not.toThrow()
  })
})

describe('isOverLimit', () => {
  it('returns false when any arg is null/undefined', () => {
    expect(isOverLimit(null, { plants: 10 }, 'plants')).toBe(false)
    expect(isOverLimit(TIERS.free, null, 'plants')).toBe(false)
  })

  it('returns false for the business tier (Infinity limits)', () => {
    expect(isOverLimit(TIERS.business, { plants: 1_000_000 }, 'plants')).toBe(false)
  })

  it('returns false when usage is below the limit', () => {
    expect(isOverLimit(TIERS.free, { plants: 49 }, 'plants')).toBe(false)
    expect(isOverLimit(TIERS.free, { plants: 0 }, 'plants')).toBe(false)
  })

  it('returns true when usage equals the limit', () => {
    expect(isOverLimit(TIERS.free, { plants: 50 }, 'plants')).toBe(true)
  })

  it('returns true when usage exceeds the limit', () => {
    expect(isOverLimit(TIERS.free, { plants: 51 }, 'plants')).toBe(true)
  })

  it('returns false for a missing usage key (treated as 0)', () => {
    expect(isOverLimit(TIERS.free, {}, 'plants')).toBe(false)
  })
})
