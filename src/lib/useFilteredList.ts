import { useMemo, useState, useEffect } from 'react'

export interface FilteredListOptions<T> {
  search?: string
  searchKey?: (item: T) => string | null | undefined
  filterFn?: (item: T) => boolean
  sortField?: string
  sortDir?: 'asc' | 'desc'
  pageSize?: number
}

export interface FilteredListResult<T> {
  paged: T[]
  filtered: T[]
  totalPages: number
  page: number
  setPage: (p: number) => void
  toggleSort: (field: string) => void
  sortField: string
  sortDir: 'asc' | 'desc'
}

export function useFilteredList<T extends Record<string, unknown>>(
  items: T[],
  {
    search = '',
    searchKey,
    filterFn,
    sortField: initialSort = 'name',
    sortDir: initialDir = 'asc',
    pageSize = 30,
  }: FilteredListOptions<T> = {},
): FilteredListResult<T> {
  const [sortField, setSortField] = useState(initialSort)
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>(initialDir)
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

  function toggleSort(field: string) {
    setSortDir(d => sortField === field ? (d === 'asc' ? 'desc' : 'asc') : 'asc')
    setSortField(field)
  }

  return { paged, filtered, totalPages, page, setPage, toggleSort, sortField, sortDir }
}
