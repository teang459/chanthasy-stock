// Settlement aggregation helpers — the same math that lives in
// public.settle_day on the database, mirrored here so the UI can show
// live running totals before a day is closed.

import { vatBreakdown } from './vat'

// movements: rows of { type, qty, payment_method, plants: { price, cost } }
// finance:   rows of { type, amount }
export function computeLiveTotals(movements = [], finance = []) {
  let sales = 0, cashSales = 0, cost = 0, income = 0, expense = 0, salesCount = 0
  for (const m of movements) {
    if (m.type !== 'out') continue
    const qty   = Math.abs(Number(m.qty ?? 0))
    const price = Number(m.plants?.price ?? 0)
    const c     = Number(m.plants?.cost ?? 0)
    const total = qty * price
    sales += total
    cost  += qty * c
    if (!m.payment_method || m.payment_method === 'cash') cashSales += total
    salesCount++
  }
  for (const f of finance) {
    if (f.type === 'income')  income  += Number(f.amount ?? 0)
    if (f.type === 'expense') expense += Number(f.amount ?? 0)
  }
  return { sales, cashSales, cost, income, expense, salesCount }
}

// expected_cash = opening + cash_sales + income - expense  (mirror of settle_day)
export function computeExpectedCash({ opening = 0, cashSales = 0, income = 0, expense = 0 }) {
  return Number(opening) + Number(cashSales) + Number(income) - Number(expense)
}

// Apply the store's VAT settings to a totals snapshot.
// Returns the original totals + base/vat/total derived via vatBreakdown.
export function applyVat(totals, store) {
  return { ...totals, ...vatBreakdown(totals.sales, store) }
}

// Net profit for a closed day: sales − cost + manual income − expense.
export function computeNetProfit({ sales = 0, cost = 0, income = 0, expense = 0 }) {
  return Number(sales) - Number(cost) + Number(income) - Number(expense)
}
