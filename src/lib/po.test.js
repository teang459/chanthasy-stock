import { describe, it, expect } from 'vitest'
import {
  computePoTotal, remainingOnLine, rollupStatusFromLines, validateReceive,
} from './po'

const line = (ordered, received = 0, cost = 0) =>
  ({ qty_ordered: ordered, qty_received: received, unit_cost: cost })

describe('computePoTotal', () => {
  it('sums qty_ordered * unit_cost across lines', () => {
    expect(computePoTotal([line(10, 0, 50), line(5, 0, 100)])).toBe(1000)
  })
  it('ignores qty_received (PO value is what we ordered, not what arrived)', () => {
    expect(computePoTotal([line(10, 8, 100)])).toBe(1000)
  })
  it('handles empty', () => {
    expect(computePoTotal([])).toBe(0)
    expect(computePoTotal()).toBe(0)
  })
})

describe('remainingOnLine', () => {
  it('returns ordered minus received', () => {
    expect(remainingOnLine(line(10, 4))).toBe(6)
    expect(remainingOnLine(line(10, 10))).toBe(0)
  })
  it('handles missing fields safely', () => {
    expect(remainingOnLine({})).toBe(0)
    expect(remainingOnLine(null)).toBe(0)
  })
})

describe('rollupStatusFromLines', () => {
  it('returns "received" when every line is fully received', () => {
    expect(rollupStatusFromLines([line(10, 10), line(5, 5)])).toBe('received')
  })
  it('returns "partial" when at least one line has progress', () => {
    expect(rollupStatusFromLines([line(10, 4), line(5, 0)])).toBe('partial')
    expect(rollupStatusFromLines([line(10, 4)])).toBe('partial')
  })
  it('returns "submitted" when nothing received yet', () => {
    expect(rollupStatusFromLines([line(10, 0), line(5, 0)])).toBe('submitted')
  })
  it('respects ifEmpty for header without lines', () => {
    expect(rollupStatusFromLines([])).toBe('draft')
    expect(rollupStatusFromLines([], { ifEmpty: 'submitted' })).toBe('submitted')
  })
})

describe('validateReceive', () => {
  it('rejects non-positive qty', () => {
    expect(validateReceive({ line: line(10, 0), qty: 0 }).ok).toBe(false)
    expect(validateReceive({ line: line(10, 0), qty: -3 }).ok).toBe(false)
    expect(validateReceive({ line: line(10, 0), qty: 'abc' }).ok).toBe(false)
  })
  it('rejects over-receipt', () => {
    const r = validateReceive({ line: line(10, 4), qty: 7 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/only 6 remaining/)
  })
  it('accepts a valid partial receive and reports remainingAfter', () => {
    const r = validateReceive({ line: line(10, 4), qty: 3 })
    expect(r.ok).toBe(true)
    expect(r.willReceive).toBe(3)
    expect(r.remainingAfter).toBe(3)
  })
  it('accepts receiving exactly the remainder', () => {
    expect(validateReceive({ line: line(10, 4), qty: 6 })).toEqual({
      ok: true, willReceive: 6, remainingAfter: 0,
    })
  })
})
