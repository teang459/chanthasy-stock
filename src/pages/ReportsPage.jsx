import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { statusOf, fmtCurrency, downloadCSV, fmtDate } from '../lib/utils'
import { useCurrency } from '../contexts/CurrencyContext'
import Spinner from '../components/Spinner'
import * as I from '../components/Icons'

export default function ReportsPage() {
  const { toast } = useToast()
  const { symbol } = useCurrency()
  const [plants, setPlants]   = useState([])
  const [moves, setMoves]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from('plants').select('*, categories(name_th,hue)'),
      supabase.from('movements').select('*, plants(name,sku)').order('created_at', { ascending: false }).limit(2000),
    ])
    setPlants(p ?? [])
    setMoves(m ?? [])
    setLoading(false)
  }

  const total    = plants.length
  const outCount = plants.filter(p => statusOf(p) === 'out').length
  const lowCount = plants.filter(p => statusOf(p) === 'low').length
  const okCount  = plants.filter(p => statusOf(p) === 'ok').length
  const totalStock = plants.reduce((s,p) => s + p.stock, 0)
  const totalValue = plants.reduce((s,p) => s + p.stock * Number(p.price), 0)
  const totalCost  = plants.reduce((s,p) => s + p.stock * Number(p.cost ?? 0), 0)

  // By category
  const byCat = {}
  plants.forEach(p => {
    const cn = p.categories?.name_th ?? 'ไม่มีหมวดหมู่'
    if (!byCat[cn]) byCat[cn] = { name: cn, count: 0, stock: 0, value: 0 }
    byCat[cn].count++
    byCat[cn].stock += p.stock
    byCat[cn].value += p.stock * Number(p.price)
  })
  const catRows = Object.values(byCat).sort((a,b) => b.value - a.value)

  // Top by stock
  const topStock = [...plants].sort((a,b) => b.stock - a.stock).slice(0, 10)
  const topValue = [...plants].sort((a,b) => (b.stock*b.price) - (a.stock*a.price)).slice(0, 10)

  function exportStock() {
    const rows = [
      ['SKU','ชื่อต้นไม้','หมวดหมู่','สต็อก','ราคา','ต้นทุน','มูลค่า','สถานะ'],
      ...plants.map(p => [p.sku, p.name, p.categories?.name_th??'', p.stock, p.price, p.cost??'', p.stock*Number(p.price), statusOf(p)])
    ]
    downloadCSV(rows, `รายงาน-สต็อก-${new Date().toISOString().slice(0,10)}.csv`)
    toast.success('ส่งออกสำเร็จ')
  }

  function exportMovements() {
    const rows = [
      ['วันที่','ต้นไม้','SKU','ประเภท','จำนวน','หมายเหตุ'],
      ...moves.map(m => [fmtDate(m.created_at), m.plants?.name??'', m.plants?.sku??'', m.type, m.qty, m.note??''])
    ]
    downloadCSV(rows, `รายงาน-เคลื่อนไหว-${new Date().toISOString().slice(0,10)}.csv`)
    toast.success('ส่งออกสำเร็จ')
  }

  if (loading) return <div className="page-center"><Spinner size={32} /></div>

  const maxVal = Math.max(...catRows.map(c=>c.value), 1)

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">รายงาน</h1></div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={exportMovements}><I.Download size={13} /> เคลื่อนไหว</button>
          <button className="btn btn-primary" onClick={exportStock}><I.Download size={13} /> สต็อกทั้งหมด</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="stats-grid">
        <ReportStat label="สินค้าทั้งหมด"  value={total}              unit="รายการ" color={140} />
        <ReportStat label="สต็อกรวม"       value={totalStock}         unit="หน่วย"  color={170} />
        <ReportStat label="มูลค่าสต็อก"    value={fmtCurrency(totalValue)} unit={symbol} color={220} />
        <ReportStat label="ต้นทุนสต็อก"    value={fmtCurrency(totalCost)}  unit={symbol} color={60}  />
        <ReportStat label="สต็อกปกติ"      value={okCount}            unit="รายการ" color={140} />
        <ReportStat label="ต้องดำเนินการ" value={lowCount+outCount}  unit="รายการ" color={25}  alert={lowCount+outCount > 0} />
      </div>

      <div className="report-grid">
        {/* By category */}
        <section className="card">
          <div className="card-header"><h2 className="card-title">มูลค่าตามหมวดหมู่</h2></div>
          {catRows.map(c => (
            <div key={c.name} className="report-bar-row">
              <div className="report-bar-label">{c.name}</div>
              <div className="report-bar-track">
                <div className="report-bar-fill" style={{ width:`${(c.value/maxVal)*100}%` }} />
              </div>
              <div className="report-bar-val">{fmtCurrency(c.value)} {symbol}</div>
            </div>
          ))}
        </section>

        {/* Top by stock */}
        <section className="card">
          <div className="card-header"><h2 className="card-title">Top 10 สต็อกมากที่สุด</h2></div>
          <div className="table-wrap" style={{ margin: 0 }}>
            <table>
              <thead><tr><th>#</th><th>ต้นไม้</th><th>สต็อก</th><th>มูลค่า</th></tr></thead>
              <tbody>
                {topStock.map((p,i) => (
                  <tr key={p.id}>
                    <td className="mono muted">{i+1}</td>
                    <td>{p.name}</td>
                    <td className="mono">{p.stock}</td>
                    <td className="mono">{fmtCurrency(p.stock * p.price)} {symbol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Top by value */}
        <section className="card">
          <div className="card-header"><h2 className="card-title">Top 10 มูลค่ามากที่สุด</h2></div>
          <div className="table-wrap" style={{ margin: 0 }}>
            <table>
              <thead><tr><th>#</th><th>ต้นไม้</th><th>ราคา</th><th>มูลค่ารวม</th></tr></thead>
              <tbody>
                {topValue.map((p,i) => (
                  <tr key={p.id}>
                    <td className="mono muted">{i+1}</td>
                    <td>{p.name}</td>
                    <td className="mono">{fmtCurrency(p.price)} {symbol}</td>
                    <td className="mono">{fmtCurrency(p.stock * p.price)} {symbol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

function ReportStat({ label, value, unit, color, alert }) {
  return (
    <div className={`stat ${alert ? 'stat--alert' : ''}`}>
      <div className="stat-label"><span>{label}</span></div>
      <div className="stat-value">
        <span style={{ color: `oklch(45% 0.12 ${color})` }}>{value}</span>
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
    </div>
  )
}
