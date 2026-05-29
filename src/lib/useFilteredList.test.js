import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFilteredList } from './useFilteredList'

const ITEMS = [
  { id: 1, name: 'Banana', stock: 10, category: 'fruit' },
  { id: 2, name: 'Apple',  stock: 5,  category: 'fruit' },
  { id: 3, name: 'Cherry', stock: 20, category: 'fruit' },
  { id: 4, name: 'Carrot', stock: 2,  category: 'veg'   },
]

describe('useFilteredList – basic usage', () => {
  it('returns all items when no search or filterFn is given', () => {
    const { result } = renderHook(() =>
      useFilteredList(ITEMS, { pageSize: 20 })
    )
    expect(result.current.filtered).toHaveLength(4)
  })

  it('filters by search term (case-insensitive)', () => {
    const { result } = renderHook(() =>
      useFilteredList(ITEMS, {
        search: 'ban',
        searchKey: it => it.name,
        pageSize: 20,
      })
    )
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].name).toBe('Banana')
  })

  it('returns empty when search matches nothing', () => {
    const { result } = renderHook(() =>
      useFilteredList(ITEMS, {
        search: 'zzz',
        searchKey: it => it.name,
        pageSize: 20,
      })
    )
    expect(result.current.filtered).toHaveLength(0)
  })

  it('applies an extra filterFn on top of search', () => {
    const { result } = renderHook(() =>
      useFilteredList(ITEMS, {
        filterFn: it => it.stock >= 10,
        pageSize: 20,
      })
    )
    const names = result.current.filtered.map(i => i.name)
    expect(names).toContain('Banana')
    expect(names).toContain('Cherry')
    expect(names).not.toContain('Apple')
    expect(names).not.toContain('Carrot')
  })
})

describe('useFilteredList – sorting', () => {
  it('sorts ascending by a string field', () => {
    const { result } = renderHook(() =>
      useFilteredList(ITEMS, { sortField: 'name', sortDir: 'asc', pageSize: 20 })
    )
    const names = result.current.filtered.map(i => i.name)
    expect(names).toEqual(['Apple', 'Banana', 'Carrot', 'Cherry'])
  })

  it('sorts descending by a string field', () => {
    const { result } = renderHook(() =>
      useFilteredList(ITEMS, { sortField: 'name', sortDir: 'desc', pageSize: 20 })
    )
    const names = result.current.filtered.map(i => i.name)
    expect(names).toEqual(['Cherry', 'Carrot', 'Banana', 'Apple'])
  })

  it('sorts numerically by a number field', () => {
    const { result } = renderHook(() =>
      useFilteredList(ITEMS, { sortField: 'stock', sortDir: 'asc', pageSize: 20 })
    )
    const stocks = result.current.filtered.map(i => i.stock)
    expect(stocks).toEqual([2, 5, 10, 20])
  })

  it('toggleSort flips asc → desc on the same field', () => {
    const { result } = renderHook(() =>
      useFilteredList(ITEMS, { sortField: 'name', sortDir: 'asc', pageSize: 20 })
    )
    act(() => result.current.toggleSort('name'))
    expect(result.current.sortDir).toBe('desc')
  })

  it('toggleSort resets to asc when switching to a new field', () => {
    const { result } = renderHook(() =>
      useFilteredList(ITEMS, { sortField: 'name', sortDir: 'desc', pageSize: 20 })
    )
    act(() => result.current.toggleSort('stock'))
    expect(result.current.sortField).toBe('stock')
    expect(result.current.sortDir).toBe('asc')
  })

  it('toggleSort on same field: desc → asc', () => {
    const { result } = renderHook(() =>
      useFilteredList(ITEMS, { sortField: 'name', sortDir: 'asc', pageSize: 20 })
    )
    act(() => result.current.toggleSort('name'))  // asc → desc
    act(() => result.current.toggleSort('name'))  // desc → asc
    expect(result.current.sortDir).toBe('asc')
  })
})

describe('useFilteredList – pagination', () => {
  it('slices the first page', () => {
    const { result } = renderHook(() =>
      useFilteredList(ITEMS, { pageSize: 2 })
    )
    expect(result.current.paged).toHaveLength(2)
    expect(result.current.totalPages).toBe(2)
    expect(result.current.page).toBe(0)
  })

  it('setPage navigates to the next page', () => {
    const { result } = renderHook(() =>
      useFilteredList(ITEMS, { pageSize: 2 })
    )
    act(() => result.current.setPage(1))
    expect(result.current.paged).toHaveLength(2)
    expect(result.current.page).toBe(1)
  })

  it('totalPages is at least 1 for an empty list', () => {
    const { result } = renderHook(() =>
      useFilteredList([], { pageSize: 10 })
    )
    expect(result.current.totalPages).toBe(1)
    expect(result.current.paged).toHaveLength(0)
  })
})
