import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { fmtDateTime, downloadCSV } from '../lib/utils'
import { userMessage } from '../lib/errors'
import { usePagination } from '../lib/usePagination'
import EmptyState from '../components/EmptyState'
import Spinner from '../components/Spinner'
import { SkeletonTable } from '../components/Skeleton'
import * as I from '../components/Icons'

const TYPE_LABEL = { in:'รับเข้า', out:'จ่ายออก', adjust:'ปรับ', new:'เพิ่มสินค้า', delete:'ลบสินค้า', rename:'เปลี่ยนชื่อ' }

const Invoice = lazy(() => import('../components/Invoice'))

export default function MovementsPage() {
  const { toast } = useToast()
  const { ownerId } = useAuth()
  const [moves, setMoves]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [invoiceFor, setInvoiceFor] = useState(null)

  useEffect(() => {
    if (!ownerId) return
    load()
    const ch = supabase.channel(`movements-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movements', filter: `store_id=eq.${ownerId}` }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [ownerId])

  async function load() {
    if (!ownerId) return
    const { data, error } = await supabase
      .from('movements')
      .select('*, plants(id,name,sku)')
      .eq('store_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) { toast.error(`โหลดไม่สำเร็จ: ${userMessage(error)}`); setLoading(false); return }
    setMoves(data ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    let list = moves
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m => m.plants?.name?.toLowerCase().includes(q) || m.plants?.sku?.toLowerCase().includes(q) || m.note?.toLowerCase().includes(q))
    }
    if (typeFilter) list = list.filter(m => m.type === typeFilter)
    return list
  }, [moves, search, typeFilter])

  const { paginated, page, setPage, totalPages } = usePagination(filtered, 30)

  function handleExport() {
    const rows = [
      ['วันที่','ต้นไม้','SKU','ประเภท','จำนวน','หมายเหตุ'],
      ...filtered.map(m => [fmtDateTime(m.created_at), m.plants?.name??'', m.plants?.sku??'', TYPE_LABEL[m.type]??m.type, m.qty, m.note??''])
    ]
    downloadCSV(rows, `movements-${new Date().toISOString().slice(0,10)}.csv`)
    toast.success('ส่งออก CSV สำเร็จ')
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><div><h1 className="page-title">ประวัติเคลื่อนไหว</h1><p className="page-sub">กำลังโหลด...</p></div></div>
        <SkeletonTable rows={8} cols={5} />
      </div>
    )
  }

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
          <option value="new">เพิ่มสินค้า</option>
          <option value="delete">ลบสินค้า</option>
          <option value="rename">เปลี่ยนชื่อ</option>
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
                <th></th>
              </tr></thead>
              <tbody>
                {paginated.map(m => (
                  <tr key={m.id}>
                    <td className="text-sm mono">{fmtDateTime(m.created_at)}</td>
                    <td>
                      <div className="plant-name">{m.plants?.name ?? (m.type === 'delete' ? m.note : '—')}</div>
                      <div className="plant-sci mono">{m.plants?.sku ?? ''}</div>
                    </td>
                    <td><span className={`move-type move-type--${m.type}`}>{TYPE_LABEL[m.type] ?? m.type}</span></td>
                    <td className={`mono ${m.type === 'in' && m.qty > 0 ? 'text-green' : m.type === 'out' ? 'text-red' : ''}`}>
                      {m.type === 'rename' ? '—' : m.type === 'in' ? `+${m.qty}` : m.type === 'out' ? `-${m.qty}` : m.qty}
                    </td>
                    <td className="text-sm muted">{m.type === 'delete' ? '—' : (m.note ?? '—')}</td>
                    <td style={{ textAlign: 'right' }}>
                      {m.type === 'out' && m.plants && (
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 11, padding: '4px 8px' }}
                          onClick={() => setInvoiceFor(m)}
                          title="ออกใบเสร็จ"
                        >
                          ใบเสร็จ
                        </button>
                      )}
                    </td>
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

      {invoiceFor && (
        <Suspense fallback={null}>
          <Invoice movement={invoiceFor} onClose={() => setInvoiceFor(null)} />
        </Suspense>
      )}
    </div>
  )
}
