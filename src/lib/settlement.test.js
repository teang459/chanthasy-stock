import { describe, it, expect } from 'vitest'
import {
  computeLiveTotals, computeExpectedCash, applyVat, computeNetProfit,
} from './settlement'

const sale = (qty, price, cost, payment = 'cash') => ({
  type: 'out', qty, payment_method: payment, plants: { price, cost },
})

describe('computeLiveTotals', () => {
  it('zeroes out an empty day', () => {
    expect(computeLiveTotals([], [])).toEqual({
      sales: 0, cashSales: 0, cost: 0, income: 0, expense: 0, salesCount: 0,
    })
  })

  it('aggregates sales / cost from out movements', () => {
    const t = computeLiveTotals([
      sale(2, 100, 30),  // 200 sales, 60 cost (cash)
      sale(1, 500, 200), // 500 sales, 200 cost (cash)
    ], [])
    expect(t.sales).toBe(700)
    expect(t.cost).toBe(260)
    expect(t.cashSales).toBe(700)
    expect(t.salesCount).toBe(2)
  })

  it('excludes non-out movements and uses absolute qty', () => {
    const t = computeLiveTotals([
      sale(-3, 100, 50),  // ABS(qty) = 3
      { type: 'in', qty: 10, plants: { price: 50, cost: 20 } },
      { type: 'adjust', qty: 5, plants: { price: 50, cost: 20 } },
    ], [])
    expect(t.sales).toBe(300)
    expect(t.cost).toBe(150)
    expect(t.salesCount).toBe(1)
  })

  it('separates cash vs non-cash for the cash drawer reconciliation', () => {
    const t = computeLiveTotals([
      sale(1, 100, 0, 'cash'),
      sale(1, 200, 0, 'transfer'),
      sale(1, 300, 0, 'credit'),
      sale(1, 50,  0, null),       // null payment counts as cash (default)
    ], [])
    expect(t.sales).toBe(650)
    expect(t.cashSales).toBe(150)  // 100 + 50
  })

  it('sums income / expense from finance entries', () => {
    const t = computeLiveTotals([], [
      { type: 'income',  amount: 100 },
      { type: 'income',  amount: 50 },
      { type: 'expense', amount: 30 },
      { type: 'expense', amount: 20 },
    ])
    expect(t.income).toBe(150)
    expect(t.expense).toBe(50)
  })
})

describe('computeExpectedCash', () => {
  it('opens + cash_sales + income - expense', () => {
    expect(computeExpectedCash({ opening: 500, cashSales: 240, income: 0, expense: 0 })).toBe(740)
    expect(computeExpectedCash({ opening: 1000, cashSales: 200, income: 50, expense: 80 })).toBe(1170)
  })
  it('coerces missing fields to 0', () => {
    expect(computeExpectedCash({})).toBe(0)
    expect(computeExpectedCash({ opening: 100 })).toBe(100)
  })
})

describe('applyVat', () => {
  it('passes sales through vatBreakdown using the store settings', () => {
    const totals = { sales: 107, cost: 0, income: 0, expense: 0, cashSales: 107, salesCount: 1 }
    const r = applyVat(totals, { vat_rate: 7, vat_inclusive: true })
    expect(r.sales).toBe(107)
    expect(r.base).toBeCloseTo(100, 5)
    expect(r.vat).toBeCloseTo(7, 5)
    expect(r.total).toBe(107)
  })

  it('returns sales unchanged when the store has no VAT', () => {
    const totals = { sales: 200, cost: 0, income: 0, expense: 0, cashSales: 200, salesCount: 1 }
    const r = applyVat(totals, { vat_rate: 0 })
    expect(r.vat).toBe(0)
    expect(r.base).toBe(200)
  })
})

describe('computeNetProfit', () => {
  it('matches settle_day net = sales - cost + income - expense', () => {
    expect(computeNetProfit({ sales: 200, cost: 100, income: 0,  expense: 0  })).toBe(100)
    expect(computeNetProfit({ sales: 500, cost: 200, income: 50, expense: 80 })).toBe(270)
  })
  it('handles missing fields', () => {
    expect(computeNetProfit({})).toBe(0)
  })
})
