import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { statusOf, fmtCurrency, downloadCSV, fmtDate } from '../lib/utils'
import { userMessage } from '../lib/errors'
import { useCurrency } from '../contexts/CurrencyContext'
import Spinner from '../components/Spinner'
import { SkeletonStats } from '../components/Skeleton'
import * as I from '../components/Icons'

const TYPE_LABEL = { in: 'รับเข้า', out: 'จ่ายออก', adjust: 'ปรับ', new: 'เพิ่ม', delete: 'ลบ', rename: 'เปลี่ยนชื่อ' }

const RANGES = [
  { value: '7',   label: '7 วัน' },
  { value: '30',  label: '30 วัน' },
  { value: '90',  label: '90 วัน' },
  { value: '365', label: '1 ปี' },
  { value: 'all', label: 'ทั้งหมด' },
]

function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// Page through movements so reports stay accurate beyond 5000 rows.
// Hard-capped at MAX_ROWS to bound memory for runaway shops.
const PAGE_SIZE = 1000
const MAX_ROWS  = 50000

async function fetchAllMovements(ownerId, range) {
  const out = []
  let offset = 0
  for (;;) {
    let q = supabase
      .from('movements')
      .select('*, plants(name,sku)')
      .eq('store_id', ownerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (range !== 'all') q = q.gte('created_at', isoDaysAgo(Number(range)))
    const { data, error } = await q
    if (error) return { data: out, error, truncated: false }
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
    if (offset >= MAX_ROWS) return { data: out, error: null, truncated: true }
  }
  return { data: out, error: null, truncated: false }
}

export default function ReportsPage() {
  const { toast } = useToast()
  const { ownerId } = useAuth()
  const { symbol } = useCurrency()
  const [plants, setPlants]   = useState([])
  const [moves, setMoves]     = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange]     = useState('30')

  useEffect(() => { if (ownerId) load() }, [range, ownerId])

  async function load() {
    if (!ownerId) return
    setLoading(true)
    try {
      const plantsQ = supabase.from('plants').select('*, categories(name_th,hue)').eq('store_id', ownerId)
      const [{ data: p, error: pErr }, movesResult] = await Promise.all([
        plantsQ,
        fetchAllMovements(ownerId, range),
      ])
      if (pErr) throw pErr
      if (movesResult.error) throw movesResult.error
      setPlants(p ?? [])
      setMoves(movesResult.data)
      if (movesResult.truncated) {
        toast.info('ข้อมูลเคลื่อนไหวมากเกิน 50,000 รายการ — แสดงเฉพาะรายการล่าสุด')
      }
    } catch (err) {
      toast.error(`โหลดข้อมูลไม่สำเร็จ: ${userMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => {
    const total      = plants.length
    const outCount   = plants.filter(p => statusOf(p) === 'out').length
    const lowCount   = plants.filter(p => statusOf(p) === 'low').length
    const okCount    = plants.filter(p => statusOf(p) === 'ok').length
    const totalStock = plants.reduce((s, p) => s + p.stock, 0)
    const totalValue = plants.reduce((s, p) => s + p.stock * Number(p.price), 0)
    const totalCost  = plants.reduce((s, p) => s + p.stock * Number(p.cost ?? 0), 0)

    const byCat = {}
    plants.forEach(p => {
      const cn = p.categories?.name_th ?? 'ไม่มีหมวดหมู่'
      if (!byCat[cn]) byCat[cn] = { name: cn, count: 0, stock: 0, value: 0 }
      byCat[cn].count++
      byCat[cn].stock += p.stock
      byCat[cn].value += p.stock * Number(p.price)
    })
    const catRows = Object.values(byCat).sort((a, b) => b.value - a.value)
    const topStock = [...plants].sort((a, b) => b.stock - a.stock).slice(0, 10)
    const topValue = [...plants].sort((a, b) => (b.stock * b.price) - (a.stock * a.price)).slice(0, 10)

    return { total, outCount, lowCount, okCount, totalStock, totalValue, totalCost, catRows, topStock, topValue }
  }, [plants])

  function exportStock() {
    const rows = [
      ['SKU', 'ชื่อต้นไม้', 'หมวดหมู่', 'สต็อก', 'ราคา', 'ต้นทุน', 'มูลค่า', 'สถานะ'],
      ...plants.map(p => [p.sku, p.name, p.categories?.name_th ?? '', p.stock, p.price, p.cost ?? '', p.stock * Number(p.price), statusOf(p)]),
    ]
    downloadCSV(rows, `รายงาน-สต็อก-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success('ส่งออกสำเร็จ')
  }

  function exportMovements() {
    const rows = [
      ['วันที่', 'ต้นไม้', 'SKU', 'ประเภท', 'จำนวน', 'หมายเหตุ'],
      ...moves.map(m => [fmtDate(m.created_at), m.plants?.name ?? '', m.plants?.sku ?? '', TYPE_LABEL[m.type] ?? m.type, m.qty, m.note ?? '']),
    ]
    downloadCSV(rows, `รายงาน-เคลื่อนไหว-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success('ส่งออกสำเร็จ')
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><div><h1 className="page-title">รายงาน</h1><p className="page-sub">กำลังโหลด...</p></div></div>
        <SkeletonStats count={6} />
      </div>
    )
  }

  const maxVal = Math.max(...stats.catRows.map(c => c.value), 1)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">รายงาน</h1>
          <p className="page-sub">{moves.length} รายการเคลื่อนไหวในช่วงที่เลือก</p>
        </div>
        <div className="page-actions" style={{ alignItems: 'center', gap: 8 }}>
          <select value={range} onChange={e => setRange(e.target.value)} style={{ minWidth: 110 }}>
            {RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={exportMovements}><I.Download size={13} /> เคลื่อนไหว</button>
          <button className="btn btn-primary" onClick={exportStock}><I.Download size={13} /> สต็อกทั้งหมด</button>
        </div>
      </div>

      <div className="stats-grid">
        <ReportStat label="สินค้าทั้งหมด"  value={stats.total}                          unit="รายการ" color={140} />
        <ReportStat label="สต็อกรวม"        value={stats.totalStock}                     unit="หน่วย"  color={170} />
        <ReportStat label="มูลค่าสต็อก"     value={fmtCurrency(stats.totalValue)}        unit={symbol} color={220} />
        <ReportStat label="ต้นทุนสต็อก"     value={fmtCurrency(stats.totalCost)}         unit={symbol} color={60}  />
        <ReportStat label="สต็อกปกติ"       value={stats.okCount}                        unit="รายการ" color={140} />
        <ReportStat label="ต้องดำเนินการ"  value={stats.lowCount + stats.outCount}      unit="รายการ" color={25}  alert={(stats.lowCount + stats.outCount) > 0} />
      </div>

      <div className="report-grid">
        <section className="card">
          <div className="card-header"><h2 className="card-title">มูลค่าตามหมวดหมู่</h2></div>
          {stats.catRows.length === 0 ? (
            <div className="card-empty" style={{ padding: 24, color: 'var(--muted)' }}>ยังไม่มีข้อมูล</div>
          ) : stats.catRows.map(c => (
            <div key={c.name} className="report-bar-row">
              <div className="report-bar-label">{c.name}</div>
              <div className="report-bar-track">
                <div className="report-bar-fill" style={{ width: `${(c.value / maxVal) * 100}%` }} />
              </div>
              <div className="report-bar-val">{fmtCurrency(c.value)} {symbol}</div>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-header"><h2 className="card-title">Top 10 สต็อกมากที่สุด</h2></div>
          <div className="table-wrap" style={{ margin: 0 }}>
            <table>
              <thead><tr><th>#</th><th>ต้นไม้</th><th>สต็อก</th><th>มูลค่า</th></tr></thead>
              <tbody>
                {stats.topStock.map((p, i) => (
                  <tr key={p.id}>
                    <td className="mono muted">{i + 1}</td>
                    <td>{p.name}</td>
                    <td className="mono">{p.stock}</td>
                    <td className="mono">{fmtCurrency(p.stock * p.price)} {symbol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="card-header"><h2 className="card-title">Top 10 มูลค่ามากที่สุด</h2></div>
          <div className="table-wrap" style={{ margin: 0 }}>
            <table>
              <thead><tr><th>#</th><th>ต้นไม้</th><th>ราคา</th><th>มูลค่ารวม</th></tr></thead>
              <tbody>
                {stats.topValue.map((p, i) => (
                  <tr key={p.id}>
                    <td className="mono muted">{i + 1}</td>
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
