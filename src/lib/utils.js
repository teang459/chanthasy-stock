export function statusOf(plant) {
  if (!plant || plant.stock <= 0) return 'out'
  if (plant.stock <= plant.min_stock) return 'low'
  return 'ok'
}

export function statusLabel(s) {
  return { ok: 'ปกติ', low: 'ใกล้หมด', out: 'หมด' }[s] ?? s
}

export function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtCurrency(n) {
  if (n == null || n === '') return '—'
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function generateSKU(prefix = 'PLT') {
  return `${prefix}${Date.now().toString(36).toUpperCase().slice(-5)}`
}

export function downloadCSV(rows, filename) {
  const BOM = '﻿'
  const csv = BOM + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(a.href)
}

export function calDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

export function calFirstDay(year, month) {
  return new Date(year, month, 1).getDay()
}

export const MONTH_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
export const DAY_TH = ['อา','จ','อ','พ','พฤ','ศ','ส']
