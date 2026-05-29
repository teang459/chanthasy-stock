import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { fmtCurrency, downloadCSV, fmtDate } from '../lib/utils'
import { userMessage } from '../lib/errors'
import { useCurrency } from '../contexts/CurrencyContext'
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

const EMPTY_STATS = {
  summary: { total: 0, outCount: 0, lowCount: 0, okCount: 0, totalStock: 0, totalValue: 0, totalCost: 0, movesCount: 0 },
  catRows: [],
  topStock: [],
  topValue: [],
  topCustomers: [],
}

// Page through movements only when the user explicitly exports.
// 50k row cap bounds memory for runaway shops; the export toast warns
// when results are truncated. Aggregates for the page itself come
// from report_stats() RPC, so no rows ride along on normal load.
const PAGE_SIZE = 1000
const MAX_ROWS  = 50000

async function fetchAllMovements(storeId, rangeDays) {
  const out = []
  let offset = 0
  for (;;) {
    let q = supabase
      .from('movements')
      .select('created_at, type, qty, note, plants(name,sku)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (rangeDays != null) {
      const since = new Date()
      since.setDate(since.getDate() - rangeDays)
      since.setHours(0, 0, 0, 0)
      q = q.gte('created_at', since.toISOString())
    }
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
  const [stats, setStats]       = useState(EMPTY_STATS)
  const [plants, setPlants]     = useState([])  // kept for stock CSV export
  const [loading, setLoading]   = useState(true)
  const [exporting, setExporting] = useState(false)
  const [range, setRange]       = useState('30')

  useEffect(() => { if (ownerId) load() }, [range, ownerId])

  async function load() {
    if (!ownerId) return
    setLoading(true)
    try {
      const rangeDays = range === 'all' ? null : Number(range)
      const [{ data: statsData, error: sErr }, { data: p, error: pErr }] = await Promise.all([
        supabase.rpc('report_stats', { p_store_id: ownerId, p_range_days: rangeDays }),
        supabase.from('plants').select('id,sku,name,stock,price,cost,categories(name_th)').eq('store_id', ownerId),
      ])
      if (sErr) throw sErr
      if (pErr) throw pErr
      setStats({ ...EMPTY_STATS, ...(statsData ?? {}) })
      setPlants(p ?? [])
    } catch (err) {
      toast.error(`โหลดข้อมูลไม่สำเร็จ: ${userMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }

  function exportStock() {
    const rows = [
      ['SKU', 'ชื่อต้นไม้', 'หมวดหมู่', 'สต็อก', 'ราคา', 'ต้นทุน', 'มูลค่า'],
      ...plants.map(p => [
        p.sku, p.name, p.categories?.name_th ?? '',
        p.stock, p.price, p.cost ?? '',
        p.stock * Number(p.price),
      ]),
    ]
    downloadCSV(rows, `รายงาน-สต็อก-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success('ส่งออกสำเร็จ')
  }

  async function exportMovements() {
    if (exporting) return
    setExporting(true)
    try {
      const rangeDays = range === 'all' ? null : Number(range)
      const { data, error, truncated } = await fetchAllMovements(ownerId, rangeDays)
      if (error) { toast.error(`ส่งออกไม่สำเร็จ: ${userMessage(error)}`); return }
      const rows = [
        ['วันที่', 'ต้นไม้', 'SKU', 'ประเภท', 'จำนวน', 'หมายเหตุ'],
        ...data.map(m => [
          fmtDate(m.created_at), m.plants?.name ?? '', m.plants?.sku ?? '',
          TYPE_LABEL[m.type] ?? m.type, m.qty, m.note ?? '',
        ]),
      ]
      downloadCSV(rows, `รายงาน-เคลื่อนไหว-${new Date().toISOString().slice(0, 10)}.csv`)
      if (truncated) toast.info('ข้อมูลเคลื่อนไหวมากเกิน 50,000 รายการ — ส่งออกเฉพาะรายการล่าสุด')
      else toast.success('ส่งออกสำเร็จ')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><div><h1 className="page-title">รายงาน</h1><p className="page-sub">กำลังโหลด...</p></div></div>
        <SkeletonStats count={6} />
      </div>
    )
  }

  const { summary, catRows, topStock, topValue, topCustomers } = stats
  const maxVal = Math.max(...catRows.map(c => Number(c.value)), 1)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">รายงาน</h1>
          <p className="page-sub">{summary.movesCount} รายการเคลื่อนไหวในช่วงที่เลือก</p>
        </div>
        <div className="page-actions" style={{ alignItems: 'center', gap: 8 }}>
          <select value={range} onChange={e => setRange(e.target.value)} style={{ minWidth: 110 }}>
            {RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={exportMovements} disabled={exporting}>
            <I.Download size={13} /> {exporting ? 'กำลังส่งออก…' : 'เคลื่อนไหว'}
          </button>
          <button className="btn btn-primary" onClick={exportStock}><I.Download size={13} /> สต็อกทั้งหมด</button>
        </div>
      </div>

      <div className="stats-grid">
        <ReportStat label="สินค้าทั้งหมด"  value={summary.total}                            unit="รายการ" color={140} />
        <ReportStat label="สต็อกรวม"        value={summary.totalStock}                       unit="หน่วย"  color={170} />
        <ReportStat label="มูลค่าสต็อก"     value={fmtCurrency(summary.totalValue)}          unit={symbol} color={220} />
        <ReportStat label="ต้นทุนสต็อก"     value={fmtCurrency(summary.totalCost)}           unit={symbol} color={60}  />
        <ReportStat label="สต็อกปกติ"       value={summary.okCount}                          unit="รายการ" color={140} />
        <ReportStat label="ต้องดำเนินการ"  value={summary.lowCount + summary.outCount}      unit="รายการ" color={25}  alert={(summary.lowCount + summary.outCount) > 0} />
      </div>

      <div className="report-grid">
        <section className="card">
          <div className="card-header"><h2 className="card-title">มูลค่าตามหมวดหมู่</h2></div>
          {catRows.length === 0 ? (
            <div className="card-empty" style={{ padding: 24, color: 'var(--muted)' }}>ยังไม่มีข้อมูล</div>
          ) : catRows.map(c => (
            <div key={c.name} className="report-bar-row">
              <div className="report-bar-label">{c.name}</div>
              <div className="report-bar-track">
                <div className="report-bar-fill" style={{ width: `${(Number(c.value) / maxVal) * 100}%` }} />
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
                {topStock.map((p, i) => (
                  <tr key={p.id}>
                    <td className="mono muted">{i + 1}</td>
                    <td>{p.name}</td>
                    <td className="mono">{p.stock}</td>
                    <td className="mono">{fmtCurrency(p.stock * Number(p.price))} {symbol}</td>
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
                {topValue.map((p, i) => (
                  <tr key={p.id}>
                    <td className="mono muted">{i + 1}</td>
                    <td>{p.name}</td>
                    <td className="mono">{fmtCurrency(p.price)} {symbol}</td>
                    <td className="mono">{fmtCurrency(p.stock * Number(p.price))} {symbol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="card-header"><h2 className="card-title">Top 10 ลูกค้าในช่วงนี้</h2></div>
          {topCustomers.length === 0 ? (
            <div className="card-empty" style={{ padding: 24, color: 'var(--muted)' }}>
              ยังไม่มีข้อมูลลูกค้า — บันทึกการขายพร้อมเลือกลูกค้าใน Stock
            </div>
          ) : (
            <div className="table-wrap" style={{ margin: 0 }}>
              <table>
                <thead><tr><th>#</th><th>ลูกค้า</th><th>ครั้ง</th><th>ยอดรวม</th></tr></thead>
                <tbody>
                  {topCustomers.map((c, i) => (
                    <tr key={c.id}>
                      <td className="mono muted">{i + 1}</td>
                      <td>
                        {c.name}
                        {c.code && <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{c.code}</span>}
                      </td>
                      <td className="mono">{c.count}</td>
                      <td className="mono">{fmtCurrency(c.total)} {symbol}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
