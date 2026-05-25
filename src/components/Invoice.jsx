import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { fmtCurrency } from '../lib/utils'
import Spinner from './Spinner'
import * as I from './Icons'

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
  const { ownerId, profile } = useAuth()
  const { symbol } = useCurrency()
  const [seq, setSeq] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadSeq() {
      const { count } = await supabase
        .from('movements')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .eq('type', 'out')
        .lte('created_at', movement.created_at)
      if (!cancelled) setSeq(count ?? 1)
    }
    loadSeq()
    return () => { cancelled = true }
  }, [ownerId, movement.created_at])

  const qty   = Math.abs(movement.qty ?? 0)
  const unit  = Number(movement.plants?.price ?? 0)
  const total = qty * unit
  const issued = new Date(movement.created_at)
  const number = seq == null ? '…' : buildInvoiceNo(movement.created_at, seq)

  return (
    <div className="invoice-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="invoice-card">
        {/* On-screen toolbar (hidden when printing) */}
        <div className="invoice-toolbar no-print">
          <div style={{ fontSize: 14, fontWeight: 600 }}>ใบเสร็จรับเงิน</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>ปิด</button>
            <button className="btn btn-primary" onClick={() => window.print()} disabled={seq == null}>
              {seq == null ? <Spinner size={13} color="#fff" /> : <><I.Download size={13} /> พิมพ์ / บันทึก PDF</>}
            </button>
          </div>
        </div>

        {/* Printable area */}
        <div className="invoice-sheet">
          <header className="invoice-head">
            <div>
              <div className="invoice-shop">{profile?.shop_name?.trim() || profile?.name || 'My Shop'}</div>
              <div className="invoice-sub">{profile?.name && profile?.shop_name ? profile.name : ''}</div>
            </div>
            <div className="invoice-meta">
              <div className="invoice-title">ใบเสร็จรับเงิน / RECEIPT</div>
              <div><span className="invoice-meta-label">เลขที่:</span> <span className="mono">{number}</span></div>
              <div><span className="invoice-meta-label">วันที่:</span> {issued.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </header>

          <section className="invoice-customer">
            <div className="invoice-meta-label">ลูกค้า</div>
            <div>{movement.note?.trim() || '—'}</div>
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
                <td style={{ textAlign: 'right' }} className="mono">{fmtCurrency(total)} {symbol}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>รวมทั้งสิ้น</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 14 }} className="mono">
                  {fmtCurrency(total)} {symbol}
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
