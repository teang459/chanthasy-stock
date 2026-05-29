// Tier definitions. Single source of truth for the in-app pricing UI,
// settings billing card, and usage-limit checks.
//
// Pricing is in THB; payment provider wires up later (Stripe / Omise).
// Numbers are easy to change here — search "TIERS" before tweaking
// quotas in any other file.

export interface TierLimits {
  plants: number
  members: number
  movements30d: number
}

export interface Tier {
  id: string
  name: string
  nameTh: string
  priceTHB: number
  blurb: string
  blurbEn: string
  limits: TierLimits
  features: string[]
  recommended?: boolean
}

export interface Subscription {
  tier: string
  [key: string]: unknown
}

export interface Usage {
  plants?: number
  members?: number
  movements30d?: number
  [key: string]: number | undefined
}

export const TIERS: Record<string, Tier> = {
  free: {
    id:       'free',
    name:     'Free',
    nameTh:   'ฟรี',
    priceTHB: 0,
    blurb:    'ทดลองใช้ได้ฟรี เหมาะกับร้านเริ่มต้น',
    blurbEn:  'Free forever — perfect for trying things out',
    limits: {
      plants:       50,
      members:       2,
      movements30d: 500,
    },
    features: [
      '1 สาขา',
      'สูงสุด 50 รายการสินค้า',
      'สมาชิก 2 คน',
      'รายงานพื้นฐาน',
    ],
  },
  pro: {
    id:       'pro',
    name:     'Pro',
    nameTh:   'โปร',
    priceTHB: 299,
    blurb:    'สำหรับร้านที่ขายเต็มเวลา ใช้ทุกฟีเจอร์',
    blurbEn:  'For full-time shops — every feature unlocked',
    limits: {
      plants:       2000,
      members:        10,
      movements30d: 20000,
    },
    features: [
      '1 สาขา',
      'สูงสุด 2,000 รายการ',
      'สมาชิก 10 คน',
      'นำเข้า CSV / สแกนบาร์โค้ด',
      'รายงานขั้นสูง + ส่งออก',
      'PO + ลูกค้า + การเงิน',
      'อีเมลสต็อกต่ำอัตโนมัติ',
    ],
    recommended: true,
  },
  business: {
    id:       'business',
    name:     'Business',
    nameTh:   'ธุรกิจ',
    priceTHB: 999,
    blurb:    'หลายสาขา ทีมใหญ่ ปริมาณสูง',
    blurbEn:  'Multi-store, large teams, high volume',
    limits: {
      plants:       Infinity,
      members:      Infinity,
      movements30d: Infinity,
    },
    features: [
      'หลายสาขา (ไม่จำกัด)',
      'รายการ + สมาชิกไม่จำกัด',
      'API access (เร็วๆ นี้)',
      'Priority support',
      'White-label invoice (เร็วๆ นี้)',
    ],
  },
}

export const TIER_ORDER: string[] = ['free', 'pro', 'business']

export function tierOf(subscription: Subscription | null | undefined): Tier {
  if (!subscription) return TIERS.free
  return TIERS[subscription.tier] || TIERS.free
}

// usage = { plants, movements30d, members }
// Returns { plants: 0.45, members: 1.0, movements30d: 0.6 } — clamped to [0, 1.5]
// (>1 means over quota; the UI shows it red).
export function usageRatios(tier: Tier | null | undefined, usage: Usage | null | undefined): Record<string, number> {
  if (!tier || !usage) return {}
  const out: Record<string, number> = {}
  for (const key of Object.keys(tier.limits)) {
    const limit = tier.limits[key as keyof TierLimits]
    const used  = usage[key] ?? 0
    if (!Number.isFinite(limit)) { out[key] = 0; continue }
    if (limit <= 0)              { out[key] = 1; continue }
    out[key] = Math.min(used / limit, 1.5)
  }
  return out
}

export function fmtTHB(amount: number | string): string {
  return Number(amount).toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

// Whether a given action would exceed the plan. Used as a soft check in
// the UI; the DB still enforces nothing yet — that lands when payment
// wiring goes in and we decide hard vs. soft enforcement.
export function isOverLimit(tier: Tier | null | undefined, usage: Usage | null | undefined, key: string): boolean {
  if (!tier || !usage) return false
  const limit = tier.limits?.[key as keyof TierLimits]
  if (!Number.isFinite(limit)) return false
  return (usage[key] ?? 0) >= limit
}
