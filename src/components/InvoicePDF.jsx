// Real PDF receipt — built with @react-pdf/renderer instead of the
// browser print dialog. Mirrors the on-screen Invoice layout closely
// enough that switching between "Print" and "Download PDF" produces
// the same document.
//
// Thai text needs a real Unicode font; the default Helvetica that
// ships with @react-pdf/renderer renders Thai as boxes. We register
// Sarabun from the official Google Fonts repo on jsdelivr — fetched
// once per session by @react-pdf/renderer when generating.
//
// This file is lazy-loaded from the Invoice modal so the ~250 KB PDF
// runtime never lands in the main bundle.

import React from 'react'
import { Document, Page, View, Text, StyleSheet, Font, pdf } from '@react-pdf/renderer'
import { vatBreakdown, hasVat } from '../lib/vat'

Font.register({
  family: 'Sarabun',
  fonts: [
    { src: 'https://cdn.jsdelivr.net/gh/google/fonts/master/ofl/sarabun/Sarabun-Regular.ttf', fontWeight: 400 },
    { src: 'https://cdn.jsdelivr.net/gh/google/fonts/master/ofl/sarabun/Sarabun-Bold.ttf',    fontWeight: 700 },
  ],
})

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Sarabun',
    fontSize: 10,
    padding: 36,
    color: '#1a1a18',
    lineHeight: 1.4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#888',
    borderBottomStyle: 'solid',
    paddingBottom: 12,
    marginBottom: 16,
  },
  shop:       { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  shopSub:    { fontSize: 9, color: '#555' },
  metaBox:    { textAlign: 'right' },
  docTitle:   { fontSize: 14, fontWeight: 700, marginBottom: 6 },
  metaLabel:  { fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaRow:    { marginBottom: 2 },
  customer: {
    marginBottom: 14,
    padding: 10,
    backgroundColor: '#f7f6f2',
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#888',
    borderBottomStyle: 'solid',
    paddingBottom: 6,
    marginBottom: 6,
    fontWeight: 700,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e5de',
    borderBottomStyle: 'solid',
  },
  tableFootRow: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  colIdx:   { width: 24 },
  colName:  { flex: 1 },
  colQty:   { width: 50, textAlign: 'right' },
  colUnit:  { width: 80, textAlign: 'right' },
  colTotal: { width: 80, textAlign: 'right' },
  sku:      { fontSize: 8, color: '#888' },
  totalLabel: { textAlign: 'right', flex: 1, paddingRight: 12 },
  totalValue: { width: 80, textAlign: 'right' },
  grandLabel: { textAlign: 'right', flex: 1, paddingRight: 12, fontWeight: 700, fontSize: 11 },
  grandValue: { width: 80, textAlign: 'right', fontWeight: 700, fontSize: 12 },
  signatures: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 40,
    gap: 40,
  },
  signCell:  { flex: 1, alignItems: 'center' },
  signLine:  { borderBottomWidth: 1, borderBottomColor: '#888', width: '80%', marginBottom: 4 },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 36,
    right: 36,
    textAlign: 'center',
    fontSize: 8,
    color: '#888',
  },
})

function fmtMoney(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function InvoiceDocument({ movement, store, customer, symbol, number }) {
  const qty       = Math.abs(movement.qty ?? 0)
  const unit      = Number(movement.plants?.price ?? 0)
  const lineTotal = qty * unit
  const vat       = vatBreakdown(lineTotal, store)
  const showVat   = hasVat(store)
  const docTitle  = showVat ? 'ใบกำกับภาษี / ใบเสร็จรับเงิน' : 'ใบเสร็จรับเงิน / RECEIPT'

  return (
    <Document title={`${number} — ${store?.name ?? 'Receipt'}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.shop}>{store?.name || 'My Shop'}</Text>
            {store?.address ? <Text style={styles.shopSub}>{store.address}</Text> : null}
            {store?.tax_id ? <Text style={styles.shopSub}>เลขผู้เสียภาษี: {store.tax_id}</Text> : null}
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.docTitle}>{docTitle}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>เลขที่</Text>
              <Text>{number}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>วันที่</Text>
              <Text>{fmtDate(movement.created_at)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.customer}>
          <Text style={styles.metaLabel}>ลูกค้า</Text>
          {customer ? (
            <View>
              <Text style={{ fontWeight: 700 }}>{customer.name}</Text>
              {customer.address ? <Text style={styles.shopSub}>{customer.address}</Text> : null}
              {(customer.phone || customer.tax_id) ? (
                <Text style={styles.shopSub}>
                  {[customer.phone, customer.tax_id && `เลขผู้เสียภาษี ${customer.tax_id}`].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text>{movement.note?.trim() || '— ลูกค้าทั่วไป —'}</Text>
          )}
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colIdx}>#</Text>
          <Text style={styles.colName}>รายการ</Text>
          <Text style={styles.colQty}>จำนวน</Text>
          <Text style={styles.colUnit}>ราคา/หน่วย</Text>
          <Text style={styles.colTotal}>รวม</Text>
        </View>

        <View style={styles.tableRow}>
          <Text style={styles.colIdx}>1</Text>
          <View style={styles.colName}>
            <Text>{movement.plants?.name ?? '—'}</Text>
            <Text style={styles.sku}>{movement.plants?.sku ?? ''}</Text>
          </View>
          <Text style={styles.colQty}>{qty}</Text>
          <Text style={styles.colUnit}>{fmtMoney(unit)} {symbol}</Text>
          <Text style={styles.colTotal}>{fmtMoney(lineTotal)} {symbol}</Text>
        </View>

        {showVat && (
          <>
            <View style={styles.tableFootRow}>
              <Text style={styles.totalLabel}>มูลค่าก่อน VAT</Text>
              <Text style={styles.totalValue}>{fmtMoney(vat.base)} {symbol}</Text>
            </View>
            <View style={styles.tableFootRow}>
              <Text style={styles.totalLabel}>
                ภาษีมูลค่าเพิ่ม {Number(vat.rate).toFixed(vat.rate % 1 === 0 ? 0 : 2)}%
                {!vat.inclusive ? ' (แยกต่างหาก)' : ''}
              </Text>
              <Text style={styles.totalValue}>{fmtMoney(vat.vat)} {symbol}</Text>
            </View>
          </>
        )}

        <View style={[styles.tableFootRow, { borderTopWidth: 1, borderTopColor: '#888', borderTopStyle: 'solid', paddingTop: 6, marginTop: 4 }]}>
          <Text style={styles.grandLabel}>รวมทั้งสิ้น</Text>
          <Text style={styles.grandValue}>{showVat ? fmtMoney(vat.total) : fmtMoney(lineTotal)} {symbol}</Text>
        </View>

        <View style={styles.signatures}>
          <View style={styles.signCell}>
            <View style={styles.signLine} />
            <Text style={styles.metaLabel}>ผู้รับเงิน</Text>
          </View>
          <View style={styles.signCell}>
            <View style={styles.signLine} />
            <Text style={styles.metaLabel}>ผู้จ่ายเงิน</Text>
          </View>
        </View>

        <Text style={styles.footer}>ขอบคุณที่ใช้บริการ — Chanthasy Stock</Text>
      </Page>
    </Document>
  )
}

export async function downloadInvoicePDF(props) {
  const blob = await pdf(<InvoiceDocument {...props} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.number}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
