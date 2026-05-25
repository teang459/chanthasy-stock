// Minimal Supabase client mock for component tests.
//
// Usage:
//   const supabase = makeSupabaseMock({ plants: [...], categories: [...] })
//   vi.mock('../lib/supabase', () => ({ supabase }))
//
// Every query chain (.from('x').select(...).eq(...).order(...)) resolves
// to { data: tableData[table] ?? [], error: null }. Single/maybeSingle
// return the first row. RPC + realtime channel calls are inert.

import { vi } from 'vitest'

export function makeSupabaseMock(tableData = {}, options = {}) {
  function buildChain(table) {
    const rows = tableData[table] ?? []
    const list   = { data: rows, error: null }
    const single = { data: rows[0] ?? null, error: null }

    const chain = {
      // builder methods all return the chain so .eq().order().limit() works
      select:  vi.fn(() => chain),
      eq:      vi.fn(() => chain),
      neq:     vi.fn(() => chain),
      not:     vi.fn(() => chain),
      in:      vi.fn(() => chain),
      is:      vi.fn(() => chain),
      gt:      vi.fn(() => chain),
      gte:     vi.fn(() => chain),
      lt:      vi.fn(() => chain),
      lte:     vi.fn(() => chain),
      like:    vi.fn(() => chain),
      ilike:   vi.fn(() => chain),
      contains: vi.fn(() => chain),
      filter:  vi.fn(() => chain),
      or:      vi.fn(() => chain),
      order:   vi.fn(() => chain),
      limit:   vi.fn(() => chain),
      range:   vi.fn(() => chain),
      insert:  vi.fn(() => chain),
      update:  vi.fn(() => chain),
      upsert:  vi.fn(() => chain),
      delete:  vi.fn(() => chain),
      // terminal methods
      single:      vi.fn(() => Promise.resolve(single)),
      maybeSingle: vi.fn(() => Promise.resolve(single)),
      // the awaitable form: `await supabase.from(t).select(...).eq(...)`
      then: (onFulfilled, onRejected) => Promise.resolve(list).then(onFulfilled, onRejected),
    }
    return chain
  }

  function channelMock() {
    const ch = {
      on: vi.fn(() => ch),
      subscribe: vi.fn(() => ch),
      unsubscribe: vi.fn(() => Promise.resolve('ok')),
    }
    return ch
  }

  return {
    from: vi.fn(buildChain),
    rpc:  vi.fn((name) => {
      const v = options.rpc?.[name]
      return Promise.resolve({ data: v ?? null, error: null })
    }),
    channel: vi.fn(channelMock),
    removeChannel: vi.fn(),
    storage: { from: vi.fn(() => ({
      upload: vi.fn(() => Promise.resolve({ data: null, error: null })),
      remove: vi.fn(() => Promise.resolve({ data: null, error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })),
      list: vi.fn(() => Promise.resolve({ data: [], error: null })),
    })) },
    auth: {
      getSession:        vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(() => Promise.resolve({ data: null, error: null })),
      signOut:           vi.fn(() => Promise.resolve({ error: null })),
      mfa: {
        getAuthenticatorAssuranceLevel:
          vi.fn(() => Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })),
      },
      admin: { deleteUser: vi.fn(), createUser: vi.fn(), getUserById: vi.fn() },
    },
    functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
  }
}

// Convenience: skeleton AuthContext value with safe defaults
export function makeAuthValue(overrides = {}) {
  return {
    user: { id: 'user-1', email: 'me@example.com' },
    profile: { id: 'user-1', name: 'Me', role: 'member', initials: 'ME' },
    stores: [],
    currentStoreId: null,
    setCurrentStoreId: () => {},
    perms: {
      perm_sell: true, perm_receive: true, perm_adjust: true,
      perm_manage_plants: true, perm_view_reports: true,
      perm_finance: true, perm_settle: true,
    },
    isSuperAdmin: false,
    loading: false,
    login: () => {}, logout: () => {},
    updateProfile: () => Promise.resolve({}),
    refreshProfile: () => Promise.resolve(),
    changePassword: () => Promise.resolve(),
    isRecoveryMode: false,
    mfaRequired: false,
    clearRecoveryMode: () => {},
    clearMfaRequired: () => {},
    ownerId: null,
    isAdmin: false,
    adminViewingOwnerId: null,
    setAdminViewingOwnerId: () => {},
    ...overrides,
  }
}
