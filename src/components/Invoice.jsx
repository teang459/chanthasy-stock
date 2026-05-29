import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useToast } from '../contexts/ToastContext'
import { fmtCurrency } from '../lib/utils'
import { vatBreakdown, hasVat } from '../lib/vat'
import { userMessage } from '../lib/errors'
import Spinner from './Spinner'
import * as I from './Icons'

function fmtMoney(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pad(n, w = 4) { return String(n).padStart(w, '0') }

// Building number is owner-scoped and deletion-stable enough for v1:
// INV-YYYYMMDD-NNNN where NNNN counts 'out' movements for this owner
// from the start of time up to and including this movement's timestamp.
function buildInvoiceNo(createdAt, seq) {
  const d = new Date(createdAt)
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`
  return `INV-${ymd}-${pad(seq)}`
}

export default function Invoice({ movement, onClose }) {
  const { ownerId, profile, stores, currentStoreId } = useAuth()
  const { symbol } = useCurrency()
  const { toast } = useToast()
  const currentStore = stores.find(s => s.id === currentStoreId)
  const [seq, setSeq] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  async function handleDownloadPDF() {
    if (downloadingPdf || seq == null) return
    setDownloadingPdf(true)
    try {
      const mod = await import('./InvoicePDF')
      await mod.downloadInvoicePDF({
        movement, store: currentStore, customer, symbol, number,
      })
    } catch (err) {
      toast.error(`ดาวน์โหลด PDF ไม่สำเร็จ: ${userMessage(err)}`)
    } finally {
      setDownloadingPdf(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function loadSeq() {
      const { count } = await supabase
        .from('movements')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', ownerId)
        .eq('type', 'out')
        .lte('created_at', movement.created_at)
      if (!cancelled) setSeq(count ?? 1)
    }
    async function loadCustomer() {
      if (!movement.customer_id) { setCustomer(null); return }
      const { data } = await supabase.from('customers').select('*').eq('id', movement.customer_id).maybeSingle()
      if (!cancelled) setCustomer(data ?? null)
    }
    loadSeq()
    loadCustomer()
    return () => { cancelled = true }
  }, [ownerId, movement.created_at, movement.customer_id])

  const qty       = Math.abs(movement.qty ?? 0)
  const unit      = Number(movement.plants?.price ?? 0)
  const lineTotal = qty * unit
  const vat       = vatBreakdown(lineTotal, currentStore)
  const showVat   = hasVat(currentStore)
  const issued    = new Date(movement.created_at)
  const number    = seq == null ? '…' : buildInvoiceNo(movement.created_at, seq)
  const docTitle  = showVat ? 'ใบกำกับภาษี / ใบเสร็จรับเงิน' : 'ใบเสร็จรับเงิน / RECEIPT'

  return (
    <div className="invoice-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="invoice-card">
        {/* On-screen toolbar (hidden when printing) */}
        <div className="invoice-toolbar no-print">
          <div style={{ fontSize: 14, fontWeight: 600 }}>ใบเสร็จรับเงิน</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>ปิด</button>
            <button className="btn btn-ghost" onClick={() => window.print()} disabled={seq == null}>
              <I.Download size={13} /> พิมพ์
            </button>
            <button className="btn btn-primary" onClick={handleDownloadPDF} disabled={seq == null || downloadingPdf}>
              {downloadingPdf
                ? <Spinner size={13} color="#fff" />
                : <><I.Download size={13} /> ดาวน์โหลด PDF</>}
            </button>
          </div>
        </div>

        {/* Printable area */}
        <div className="invoice-sheet">
          <header className="invoice-head">
            <div>
              <div className="invoice-shop">{currentStore?.name || profile?.name || 'My Shop'}</div>
              {currentStore?.address && (
                <div className="invoice-sub">{currentStore.address}</div>
              )}
              {currentStore?.tax_id && (
                <div className="invoice-sub mono" style={{ marginTop: 4 }}>
                  เลขผู้เสียภาษี: {currentStore.tax_id}
                </div>
              )}
            </div>
            <div className="invoice-meta">
              <div className="invoice-title">{docTitle}</div>
              <div><span className="invoice-meta-label">เลขที่:</span> <span className="mono">{number}</span></div>
              <div><span className="invoice-meta-label">วันที่:</span> {issued.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </header>

          <section className="invoice-customer">
            <div className="invoice-meta-label">ลูกค้า</div>
            {customer ? (
              <div>
                <div style={{ fontWeight: 500 }}>{customer.name}</div>
                {customer.address && <div style={{ fontSize: 12, color: '#555' }}>{customer.address}</div>}
                <div style={{ fontSize: 12, color: '#555' }}>
                  {[customer.phone, customer.tax_id && `เลขผู้เสียภาษี ${customer.tax_id}`].filter(Boolean).join(' · ')}
                </div>
              </div>
            ) : (
              <div>{movement.note?.trim() || '— ลูกค้าทั่วไป —'}</div>
            )}
          </section>

          <table className="invoice-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>รายการ</th>
                <th style={{ textAlign: 'right', width: 80 }}>จำนวน</th>
                <th style={{ textAlign: 'right', width: 110 }}>ราคา/หน่วย</th>
                <th style={{ textAlign: 'right', width: 110 }}>รวม</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>
                  <div>{movement.plants?.name ?? '—'}</div>
                  <div className="mono" style={{ fontSize: 11, color: '#666' }}>{movement.plants?.sku ?? ''}</div>
                </td>
                <td style={{ textAlign: 'right' }} className="mono">{qty}</td>
                <td style={{ textAlign: 'right' }} className="mono">{fmtCurrency(unit)} {symbol}</td>
                <td style={{ textAlign: 'right' }} className="mono">{fmtCurrency(lineTotal)} {symbol}</td>
              </tr>
            </tbody>
            <tfoot>
              {showVat && (
                <>
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'right' }}>มูลค่าก่อน VAT</td>
                    <td style={{ textAlign: 'right' }} className="mono">{fmtMoney(vat.base)} {symbol}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'right' }}>
                      ภาษีมูลค่าเพิ่ม {Number(vat.rate).toFixed(vat.rate % 1 === 0 ? 0 : 2)}%
                      {!vat.inclusive && <span style={{ fontSize: 11, color: '#666' }}> (แยกต่างหาก)</span>}
                    </td>
                    <td style={{ textAlign: 'right' }} className="mono">{fmtMoney(vat.vat)} {symbol}</td>
                  </tr>
                </>
              )}
              <tr>
                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>รวมทั้งสิ้น</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 14 }} className="mono">
                  {showVat ? fmtMoney(vat.total) : fmtCurrency(lineTotal)} {symbol}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="invoice-signatures">
            <div>
              <div className="invoice-sign-line" />
              <div className="invoice-meta-label">ผู้รับเงิน</div>
            </div>
            <div>
              <div className="invoice-sign-line" />
              <div className="invoice-meta-label">ผู้จ่ายเงิน</div>
            </div>
          </div>

          <footer className="invoice-footer">
            ขอบคุณที่ใช้บริการ — Chanthasy Stock
          </footer>
        </div>
      </div>
    </div>
  )
}
