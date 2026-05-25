// Helpers for the Admin Panel (super-admin tooling) — pulled out of
// AdminPage so they're unit-testable.

// Generate the next sensible store code given a list of existing
// stores. Strips non-digits from each `code` field, finds the highest
// numeric suffix, and returns 'STR' + (max + 1) zero-padded to 3.
//
// Stores with no numeric suffix are ignored. Output is deterministic:
// suggestStoreCode([]) => 'STR001'.
export function suggestStoreCode(stores = []) {
  const nums = stores
    .map(s => Number(String(s?.code ?? '').replace(/\D/g, '')))
    .filter(n => Number.isFinite(n) && n > 0)
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return 'STR' + String(next).padStart(3, '0')
}
