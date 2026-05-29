import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePagination } from './usePagination'

const list25 = Array.from({ length: 25 }, (_, i) => i + 1)

describe('usePagination', () => {
  it('starts on page 1 with the first slice', () => {
    const { result } = renderHook(() => usePagination(list25, 10))
    expect(result.current.page).toBe(1)
    expect(result.current.totalPages).toBe(3)
    expect(result.current.paginated).toEqual([1,2,3,4,5,6,7,8,9,10])
  })

  it('paginates via setPage', () => {
    const { result } = renderHook(() => usePagination(list25, 10))
    act(() => result.current.setPage(2))
    expect(result.current.paginated).toEqual([11,12,13,14,15,16,17,18,19,20])
    act(() => result.current.setPage(3))
    expect(result.current.paginated).toEqual([21,22,23,24,25])
  })

  it('clamps page above totalPages so a shrinking list never strands the view', () => {
    const { result, rerender } = renderHook(({ items }) => usePagination(items, 10), {
      initialProps: { items: list25 },
    })
    act(() => result.current.setPage(3))
    expect(result.current.page).toBe(3)
    // List shrinks (e.g. user filtered) — page should clamp to the new end.
    rerender({ items: list25.slice(0, 12) })
    expect(result.current.totalPages).toBe(2)
    expect(result.current.page).toBe(2)
    expect(result.current.paginated).toEqual([11,12])
  })

  it('clamps page below 1', () => {
    const { result } = renderHook(() => usePagination(list25, 10))
    act(() => result.current.setPage(-3))
    expect(result.current.page).toBe(1)
    expect(result.current.paginated[0]).toBe(1)
  })

  it('returns totalPages of at least 1 for empty list', () => {
    const { result } = renderHook(() => usePagination([], 10))
    expect(result.current.totalPages).toBe(1)
    expect(result.current.paginated).toEqual([])
  })
})
