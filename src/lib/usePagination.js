import { useState, useMemo } from 'react'

// 1-based pagination for already-filtered lists.
//
// Returns:
//   page        — the current page (clamped into [1, totalPages] so a
//                 shrinking list never strands the view on an empty page)
//   setPage     — setter; passes through unchanged
//   totalPages  — at least 1, even for empty lists
//   paginated   — the slice for the current page
//
// Callers do the filtering / memoization; this hook only knows about
// page math. Clamping on read means search filters can shrink the
// list without an extra effect to reset the page.

export function usePagination(items, pageSize = 30) {
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const clamped    = Math.min(Math.max(page, 1), totalPages)

  const paginated = useMemo(
    () => items.slice((clamped - 1) * pageSize, clamped * pageSize),
    [items, clamped, pageSize],
  )

  return { page: clamped, setPage, totalPages, paginated }
}
