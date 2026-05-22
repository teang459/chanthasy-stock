import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { fmtDateTime, downloadCSV } from '../lib/utils'
import EmptyState from '../components/EmptyState'
import Spinner from '../components/Spinner'
import * as I from '../components/Icons'

const TYPE_LABEL = { in:'รับเข้า', out:'จ่ายออก', adjust:'ปรับ' }

export default function MovementsPage() {
  const { toast } = useToast()
  const [moves, setMoves]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage]           = useState(1)
  const PER_PAGE = 30

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase
      .from('movements')
      .select('*, plants(id,name,sku)')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) { toast.error('โหลดไม่สำเร็จ'); setLoading(false); return }
    setMoves(data ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    let list = [...moves]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m => m.plants?.name?.toLowerCase().includes(q) || m.plants?.sku?.toLowerCase().includes(q) || m.note?.toLowerCase().includes(q))
    }
    if (typeFilter) list = list.filter(m => m.type === typeFilter)
    return list
  }, [moves, search, typeFilter])

  const paginated = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  function handleExport() {
    const rows = [
      ['วันที่','ต้นไม้','SKU','ประเภท','จำนวน','หมายเหตุ'],
      ...filtered.map(m => [fmtDateTime(m.created_at), m.plants?.name??'', m.plants?.sku??'', TYPE_LABEL[m.type]??m.type, m.qty, m.note??''])
    ]
    downloadCSV(rows, `movements-${new Date().toISOString().slice(0,10)}.csv`)
    toast.success('ส่งออก CSV สำเร็จ')
  }

  if (loading) return <div className="page-center"><Spinner size={32} /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">ประวัติเคลื่อนไหว</h1>
          <p className="page-sub">{filtered.length} รายการ</p>
        </div>
        <button className="btn btn-ghost" onClick={handleExport}><I.Download size={13} /> ส่งออก CSV</button>
      </div>

      <div className="filters">
        <div className="search-wrap">
          <I.Search size={13} className="search-icon" />
          <input placeholder="ค้นหาต้นไม้, SKU, หมายเหตุ…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          {search && <button className="search-clear" onClick={() => setSearch('')}><I.X size={12} /></button>}
        </div>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}>
          <option value="">ทุกประเภท</option>
          <option value="in">รับเข้า</option>
          <option value="out">จ่ายออก</option>
          <option value="adjust">ปรับ</option>
        </select>
      </div>

      {paginated.length === 0 ? (
        <EmptyState title="ไม่พบรายการ" desc="ยังไม่มีประวัติการเคลื่อนไหว" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>วันที่/เวลา</th>
                <th>ต้นไม้</th>
                <th>ประเภท</th>
                <th>จำนวน</th>
                <th>หมายเหตุ</th>
              </tr></thead>
              <tbody>
                {paginated.map(m => (
                  <tr key={m.id}>
                    <td className="text-sm mono">{fmtDateTime(m.created_at)}</td>
                    <td>
                      <div className="plant-name">{m.plants?.name ?? '—'}</div>
                      <div className="plant-sci mono">{m.plants?.sku ?? ''}</div>
                    </td>
                    <td><span className={`move-type move-type--${m.type}`}>{TYPE_LABEL[m.type] ?? m.type}</span></td>
                    <td className={`mono ${m.qty > 0 ? 'text-green' : m.qty < 0 ? 'text-red' : ''}`}>
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </td>
                    <td className="text-sm muted">{m.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p-1)}><I.ChevronL size={14} /></button>
              <span>หน้า {page} / {totalPages}</span>
              <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage(p => p+1)}><I.Chevron size={14} /></button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
