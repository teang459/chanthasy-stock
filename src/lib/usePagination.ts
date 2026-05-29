import { useMemo, useState, useEffect } from 'react'

export interface PaginationResult<T> {
  page: number
  setPage: (p: number) => void
  totalPages: number
  paginated: T[]
}

// 1-based pagination — page 1 is the first page.
export function usePagination<T>(items: T[], pageSize = 30): PaginationResult<T> {
  const [page, setPageRaw] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  // Clamp when items shrink so the view never strands on a now-empty page.
  useEffect(() => {
    if (page > totalPages) setPageRaw(totalPages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  const paginated = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  )

  function setPage(p: number) {
    setPageRaw(Math.max(1, Math.min(p, totalPages)))
  }

  return { page, setPage, totalPages, paginated }
}
