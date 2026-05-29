// Permission resolution for the multi-store model.
// Pure functions extracted from AuthContext so they can be unit-tested
// without mocking React hooks or Supabase.

export const PERM_KEYS = Object.freeze([
  'perm_sell',
  'perm_receive',
  'perm_adjust',
  'perm_manage_plants',
  'perm_view_reports',
  'perm_finance',
  'perm_settle',
] as const)

export type PermKey = typeof PERM_KEYS[number]

export type Perms = Record<PermKey, boolean>

export interface Store {
  id: string
  name?: string
  perms?: Perms
  role?: string
  [key: string]: unknown
}

export interface Profile {
  id?: string
  role?: string
  [key: string]: unknown
}

export const ALL_PERMS: Perms = Object.freeze(
  Object.fromEntries(PERM_KEYS.map(k => [k, true])) as Perms
)

export const NO_PERMS: Perms = Object.freeze(
  Object.fromEntries(PERM_KEYS.map(k => [k, false])) as Perms
)

// Super admin from a profile row. After Phase C the rule is just:
// profiles.role === 'super_admin'. The legacy "admin + manager_id NULL"
// representation no longer exists in production.
export function isSuperAdmin(profile: Profile | null | undefined): boolean {
  return Boolean(profile) && (profile as Profile).role === 'super_admin'
}

// Derive perm flags for the active store.
// Super admins always have every perm; members get the flags from
// their store_members row in the active store; otherwise no perms.
export function resolvePerms({ isSuperAdmin: superAdmin, stores, currentStoreId }: {
  isSuperAdmin: boolean
  stores?: Store[]
  currentStoreId?: string | null
}): Perms {
  if (superAdmin) return ALL_PERMS
  const s = (stores ?? []).find(s => s.id === currentStoreId)
  return s?.perms ?? NO_PERMS
}

// Convenience guard for the stock-adjust modal: any of sell/receive/adjust.
export function canAdjustStock(perms: Perms | null | undefined): boolean {
  return Boolean(perms?.perm_sell || perms?.perm_receive || perms?.perm_adjust)
}

// Pick the default active store for a newly-loaded session.
// Prefer (a) what was persisted in localStorage if still valid,
// (b) the user's own store (id === profile.id, the 1:1 backfill case),
// (c) the first store the user belongs to. Returns null when no stores.
export function pickInitialStore({ savedId, stores, profileId }: {
  savedId?: string | null
  stores?: Store[]
  profileId?: string | null
}): string | null {
  const list = stores ?? []
  if (savedId && list.some(s => s.id === savedId)) return savedId
  if (profileId && list.some(s => s.id === profileId)) return profileId
  return list[0]?.id ?? null
}

// Roll a store_members.role value into a Thai display label.
export function membershipRoleLabel({ isSuperAdmin: superAdmin, currentStore }: {
  isSuperAdmin: boolean
  currentStore?: Store | null
}): string {
  if (superAdmin) return 'Super Admin'
  switch (currentStore?.role) {
    case 'store_admin': return 'Store Admin'
    case 'viewer':      return 'Viewer'
    default:            return currentStore ? 'Staff' : '—'
  }
}
