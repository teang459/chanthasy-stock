import { useMemo, useState, useEffect } from 'react'

/**
 * Filter + sort + paginate a list in memory.
 *
 * @param {Array} items
 * @param {Object} opts
 * @param {string}   opts.search        — search query
 * @param {Function} opts.searchKey     — (item) => string used to match search
 * @param {Function} opts.filterFn      — optional extra filter predicate
 * @param {string}   opts.sortField     — field name to sort by
 * @param {'asc'|'desc'} opts.sortDir
 * @param {number}   opts.pageSize      — items per page
 * @returns { paged, filtered, totalPages, page, setPage, toggleSort, sortField, sortDir }
 */
export function useFilteredList(items, {
  search = '',
  searchKey,
  filterFn,
  sortField: initialSort = 'name',
  sortDir: initialDir = 'asc',
  pageSize = 30,
} = {}) {
  const [sortField, setSortField] = useState(initialSort)
  const [sortDir, setSortDir]     = useState(initialDir)
  const [page, setPage]           = useState(0)

  // Reset to page 0 whenever filters change
  useEffect(() => { setPage(0) }, [search, sortField, sortDir, items.length])

  const filtered = useMemo(() => {
    let list = [...(items ?? [])]
    if (search && searchKey) {
      const q = search.toLowerCase()
      list = list.filter(it => {
        const s = searchKey(it)
        return s != null && String(s).toLowerCase().includes(q)
      })
    }
    if (filterFn) list = list.filter(filterFn)
    if (sortField) {
      list.sort((a, b) => {
        const av = a?.[sortField] ?? ''
        const bv = b?.[sortField] ?? ''
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'th')
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return list
  }, [items, search, searchKey, filterFn, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)

  function toggleSort(field) {
    setSortDir(d => sortField === field ? (d === 'asc' ? 'desc' : 'asc') : 'asc')
    setSortField(field)
  }

  return { paged, filtered, totalPages, page, setPage, toggleSort, sortField, sortDir }
}
