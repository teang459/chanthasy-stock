import React from 'react'
import * as I from './Icons'

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function SettlementReport({ row, store, symbol, onClose }) {
  const date = new Date(row.business_date)
  const opened = row.opened_at ? new Date(row.opened_at) : null
  const closed = row.closed_at ? new Date(row.closed_at) : null

  return (
    <div className="invoice-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="invoice-card">
        <div className="invoice-toolbar no-print">
          <div style={{ fontSize: 14, fontWeight: 600 }}>ใบสรุปยอดประจำวัน (Z-report)</div>
          <div className="row">
            <button className="btn btn-ghost" onClick={onClose}>ปิด</button>
            <button className="btn btn-primary" onClick={() => window.print()}>
              <I.Download size={13} /> พิมพ์ / บันทึก PDF
            </button>
          </div>
        </div>

        <div className="invoice-sheet">
          <header className="invoice-head">
            <div>
              <div className="invoice-shop">{store?.name || 'My Store'}</div>
              {store?.code && <div className="invoice-sub mono">รหัสสาขา: {store.code}</div>}
              {store?.tax_id && <div className="invoice-sub mono">เลขผู้เสียภาษี: {store.tax_id}</div>}
            </div>
            <div className="invoice-meta">
              <div className="invoice-title">ใบสรุปยอดประจำวัน</div>
              <div><span className="invoice-meta-label">วันที่:</span> {date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
              <div><span className="invoice-meta-label">สถานะ:</span> {row.status === 'closed' ? 'ปิดยอดแล้ว' : row.status === 'reopened' ? 'เปิดซ้ำ' : 'ยังไม่ปิด'}</div>
            </div>
          </header>

          <section style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, margin: '0 0 8px', borderBottom: '1px solid #ddd', paddingBottom: 4 }}>เวลาทำการ</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              <div>เปิดยอด: {opened ? opened.toLocaleString('th-TH') : '—'}</div>
              <div>ปิดยอด: {closed ? closed.toLocaleString('th-TH') : '—'}</div>
            </div>
          </section>

          <section style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, margin: '0 0 8px', borderBottom: '1px solid #ddd', paddingBottom: 4 }}>ยอดขาย</h3>
            <table className="invoice-table">
              <tbody>
                <tr>
                  <td>มูลค่าก่อน VAT</td>
                  <td className="mono text-right">{fmt(Number(row.total_sales || 0) - Number(row.total_vat || 0))} {symbol}</td>
                </tr>
                <tr>
                  <td>VAT</td>
                  <td className="mono text-right">{fmt(row.total_vat)} {symbol}</td>
                </tr>
                <tr>
                  <td><strong>ยอดขายรวม</strong></td>
                  <td className="mono text-right fw-600">{fmt(row.total_sales)} {symbol}</td>
                </tr>
                <tr>
                  <td>ต้นทุนสินค้าขาย</td>
                  <td className="mono text-right" style={{ color: '#666' }}>({fmt(row.total_cost)} {symbol})</td>
                </tr>
                <tr>
                  <td>รายรับเพิ่ม</td>
                  <td className="mono text-right">{fmt(row.total_income)} {symbol}</td>
                </tr>
                <tr>
                  <td>รายจ่าย</td>
                  <td className="mono text-right" style={{ color: '#666' }}>({fmt(row.total_expense)} {symbol})</td>
                </tr>
                <tr style={{ borderTop: '2px solid #111' }}>
                  <td className="fw-700">กำไรสุทธิ</td>
                  <td className="mono text-right fw-700" style={{ fontSize: 14 }}>{fmt(row.net_sales)} {symbol}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h3 style={{ fontSize: 13, margin: '0 0 8px', borderBottom: '1px solid #ddd', paddingBottom: 4 }}>การกระทบยอดเงินสด</h3>
            <table className="invoice-table">
              <tbody>
                <tr><td>เงินสดตั้งต้น</td><td className="mono text-right">{fmt(row.opening_cash)} {symbol}</td></tr>
                <tr><td>เงินสดคาดหวัง</td><td className="mono text-right">{fmt(row.expected_cash)} {symbol}</td></tr>
                <tr><td>เงินสดที่นับได้</td><td className="mono text-right">{fmt(row.closing_cash)} {symbol}</td></tr>
                <tr style={{ borderTop: '2px solid #111' }}>
                  <td className="fw-700">ส่วนต่าง</td>
                  <td className="mono text-right fw-700" style={{
                    color: row.difference == null ? undefined : (Number(row.difference) === 0 ? '#111' : Number(row.difference) > 0 ? '#16a34a' : '#dc2626')
                  }}>
                    {row.difference != null && Number(row.difference) > 0 ? '+' : ''}{fmt(row.difference)} {symbol}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {row.note && (
            <section style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 13, margin: '0 0 8px', borderBottom: '1px solid #ddd', paddingBottom: 4 }}>หมายเหตุ</h3>
              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{row.note}</pre>
            </section>
          )}

          <div className="invoice-signatures">
            <div><div className="invoice-sign-line" /><div className="invoice-meta-label">ผู้ปิดยอด</div></div>
            <div><div className="invoice-sign-line" /><div className="invoice-meta-label">ผู้ตรวจสอบ</div></div>
          </div>

          <footer className="invoice-footer">Chanthasy Stock — Z-report</footer>
        </div>
      </div>
    </div>
  )
}
