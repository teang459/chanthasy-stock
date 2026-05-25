// VAT helpers. Treats vat_rate as a percentage (e.g. 7 = 7%).
// When inclusive, the displayed line price already contains VAT;
// when exclusive, VAT is added on top of the line total.

export function vatBreakdown(lineTotal, { vat_rate = 0, vat_inclusive = true } = {}) {
  const rate = Number(vat_rate) || 0
  if (rate <= 0) {
    return { base: lineTotal, vat: 0, total: lineTotal, rate: 0, inclusive: !!vat_inclusive }
  }
  if (vat_inclusive) {
    const base = lineTotal / (1 + rate / 100)
    return { base, vat: lineTotal - base, total: lineTotal, rate, inclusive: true }
  }
  const vat = lineTotal * (rate / 100)
  return { base: lineTotal, vat, total: lineTotal + vat, rate, inclusive: false }
}

export function hasVat(profile) {
  return Boolean(profile) && Number(profile.vat_rate) > 0
}
