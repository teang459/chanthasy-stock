import { describe, it, expect } from 'vitest'
import {
  ALL_PERMS, NO_PERMS,
  isSuperAdmin, resolvePerms, canAdjustStock,
  pickInitialStore, membershipRoleLabel,
} from './perms'

describe('isSuperAdmin', () => {
  it('returns true only for the super_admin role', () => {
    expect(isSuperAdmin({ role: 'super_admin' })).toBe(true)
    expect(isSuperAdmin({ role: 'member' })).toBe(false)
    expect(isSuperAdmin(null)).toBe(false)
    expect(isSuperAdmin(undefined)).toBe(false)
  })
  it('ignores the legacy admin role (dropped in Phase C)', () => {
    expect(isSuperAdmin({ role: 'admin' })).toBe(false)
  })
})

describe('resolvePerms', () => {
  const storeA = { id: 'A', perms: { ...NO_PERMS, perm_sell: true, perm_receive: true } }
  const storeB = { id: 'B', perms: { ...NO_PERMS, perm_settle: true } }

  it('super admin always gets every perm', () => {
    expect(resolvePerms({ isSuperAdmin: true, stores: [], currentStoreId: null })).toEqual(ALL_PERMS)
    expect(resolvePerms({ isSuperAdmin: true, stores: [storeA], currentStoreId: 'A' })).toEqual(ALL_PERMS)
  })

  it('non-super gets the perms of the current store', () => {
    expect(resolvePerms({ isSuperAdmin: false, stores: [storeA, storeB], currentStoreId: 'A' }))
      .toEqual(storeA.perms)
    expect(resolvePerms({ isSuperAdmin: false, stores: [storeA, storeB], currentStoreId: 'B' }))
      .toEqual(storeB.perms)
  })

  it('non-super with no matching store returns NO_PERMS', () => {
    expect(resolvePerms({ isSuperAdmin: false, stores: [storeA], currentStoreId: 'B' })).toEqual(NO_PERMS)
    expect(resolvePerms({ isSuperAdmin: false, stores: [], currentStoreId: 'A' })).toEqual(NO_PERMS)
    expect(resolvePerms({ isSuperAdmin: false, stores: undefined, currentStoreId: undefined })).toEqual(NO_PERMS)
  })
})

describe('canAdjustStock', () => {
  it('allows when any of sell/receive/adjust is granted', () => {
    expect(canAdjustStock({ ...NO_PERMS, perm_sell: true })).toBe(true)
    expect(canAdjustStock({ ...NO_PERMS, perm_receive: true })).toBe(true)
    expect(canAdjustStock({ ...NO_PERMS, perm_adjust: true })).toBe(true)
  })
  it('blocks when none of the three is granted', () => {
    expect(canAdjustStock({ ...NO_PERMS, perm_manage_plants: true })).toBe(false)
    expect(canAdjustStock(NO_PERMS)).toBe(false)
    expect(canAdjustStock(null)).toBe(false)
  })
})

describe('pickInitialStore', () => {
  const stores = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]

  it('returns the saved id when still valid', () => {
    expect(pickInitialStore({ savedId: 'B', stores, profileId: 'A' })).toBe('B')
  })
  it('falls back to the profile-id store (1:1 owner backfill)', () => {
    expect(pickInitialStore({ savedId: 'Z', stores, profileId: 'A' })).toBe('A')
    expect(pickInitialStore({ savedId: null, stores, profileId: 'C' })).toBe('C')
  })
  it('falls back to the first store when neither match', () => {
    expect(pickInitialStore({ savedId: 'Z', stores, profileId: 'Z' })).toBe('A')
  })
  it('returns null when there are no stores', () => {
    expect(pickInitialStore({ savedId: 'A', stores: [], profileId: 'A' })).toBe(null)
    expect(pickInitialStore({ savedId: null, stores: undefined, profileId: null })).toBe(null)
  })
})

describe('membershipRoleLabel', () => {
  it('labels super admin first', () => {
    expect(membershipRoleLabel({ isSuperAdmin: true, currentStore: { role: 'staff' } })).toBe('Super Admin')
  })
  it('maps store membership roles', () => {
    expect(membershipRoleLabel({ isSuperAdmin: false, currentStore: { role: 'store_admin' } })).toBe('Store Admin')
    expect(membershipRoleLabel({ isSuperAdmin: false, currentStore: { role: 'viewer' } })).toBe('Viewer')
    expect(membershipRoleLabel({ isSuperAdmin: false, currentStore: { role: 'staff' } })).toBe('Staff')
  })
  it('returns dash when not in any store', () => {
    expect(membershipRoleLabel({ isSuperAdmin: false, currentStore: null })).toBe('—')
    expect(membershipRoleLabel({ isSuperAdmin: false, currentStore: undefined })).toBe('—')
  })
})
