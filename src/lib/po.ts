// Purchase order math + status rollup, mirrored from
// public.receive_po_line on the database.

export interface PoLine {
  qty_ordered?: number
  qty_received?: number
  unit_cost?: number
}

export type PoStatus = 'draft' | 'submitted' | 'partial' | 'received'

export interface ReceiveResult {
  ok: boolean
  error?: string
  willReceive?: number
  remainingAfter?: number
}

// Sum lines as qty_ordered * unit_cost (= what the store will owe
// the supplier once everything is received).
export function computePoTotal(lines: PoLine[] = []): number {
  return lines.reduce(
    (sum, l) => sum + Number(l.qty_ordered ?? 0) * Number(l.unit_cost ?? 0),
    0,
  )
}

// What remains to be received on one line.
export function remainingOnLine(line: PoLine | null | undefined): number {
  return Number(line?.qty_ordered ?? 0) - Number(line?.qty_received ?? 0)
}

// Header status after receiving — used both by the DB RPC and the UI
// so the screen can preview the next status without round-tripping.
// 'draft' / 'submitted' never advance on their own; a receipt event
// transitions them to 'partial' or 'received'.
export function rollupStatusFromLines(lines: PoLine[] = [], { ifEmpty = 'draft' as PoStatus } = {}): PoStatus {
  if (!lines.length) return ifEmpty
  const allDone = lines.every(l => Number(l.qty_received ?? 0) >= Number(l.qty_ordered ?? 0))
  if (allDone) return 'received'
  const anyReceived = lines.some(l => Number(l.qty_received ?? 0) > 0)
  return anyReceived ? 'partial' : 'submitted'
}

// Validate a receive request before it hits the network.
export function validateReceive({ line, qty }: { line: PoLine | null | undefined; qty: number | string }): ReceiveResult {
  const n = Number(qty)
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: 'qty must be > 0' }
  }
  const remaining = remainingOnLine(line)
  if (n > remaining) {
    return { ok: false, error: `cannot receive ${n}; only ${remaining} remaining` }
  }
  return { ok: true, willReceive: n, remainingAfter: remaining - n }
}
