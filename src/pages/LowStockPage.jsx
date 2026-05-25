import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { statusOf, fmtCurrency } from '../lib/utils'
import { userMessage } from '../lib/errors'
import { useCurrency } from '../contexts/CurrencyContext'
import StatusBadge from '../components/StatusBadge'
import StockBar from '../components/StockBar'
import EmptyState from '../components/EmptyState'
import Spinner from '../components/Spinner'
import { SkeletonTable } from '../components/Skeleton'
import * as I from '../components/Icons'

export default function LowStockPage() {
  const { toast } = useToast()
  const { ownerId } = useAuth()
  const { symbol } = useCurrency()
  const [plants, setPlants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
    if (!ownerId) return
    const ch = supabase.channel(`low-page-${ownerId}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'plants', filter: `store_id=eq.${ownerId}` }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [ownerId])

  async function load() {
    if (!ownerId) return
    const { data, error } = await supabase
      .from('plants')
      .select('*, categories(name_th,hue)')
      .eq('store_id', ownerId)
      .order('stock')
    if (error) { toast.error(`โหลดข้อมูลไม่สำเร็จ: ${userMessage(error)}`); setLoading(false); return }
    setPlants((data ?? []).filter(p => statusOf(p) !== 'ok'))
    setLoading(false)
  }

  const out = plants.filter(p => statusOf(p) === 'out')
  const low = plants.filter(p => statusOf(p) === 'low')

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><div><h1 className="page-title">แจ้งเตือนสต็อก</h1><p className="page-sub">กำลังโหลด...</p></div></div>
        <SkeletonTable rows={5} cols={5} />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">แจ้งเตือนสต็อก</h1>
          <p className="page-sub">พบ {out.length} หมด, {low.length} ใกล้หมด</p>
        </div>
        <Link to="/stock" className="btn btn-primary"><I.Box size={13} /> จัดการสต็อก</Link>
      </div>

      {plants.length === 0 ? (
        <EmptyState title="สต็อกทุกรายการปกติ" desc="ไม่มีรายการที่ต้องดำเนินการในขณะนี้" />
      ) : (
        <>
          {out.length > 0 && (
            <section className="alert-section">
              <h2 className="section-title"><I.Warning size={14} style={{ color:'var(--danger)' }} /> หมดสต็อก ({out.length} รายการ)</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ต้นไม้</th><th>หมวดหมู่</th><th>สต็อก</th><th>ราคา</th><th>สถานะ</th></tr></thead>
                  <tbody>
                    {out.map(p => (
                      <tr key={p.id}>
                        <td><div className="plant-name">{p.name}</div><div className="plant-sci mono">{p.sku}</div></td>
                        <td>{p.categories && <span className="badge" style={{ background:`oklch(95% 0.03 ${p.categories.hue})`, color:`oklch(35% 0.08 ${p.categories.hue})`, borderColor:'transparent' }}>{p.categories.name_th}</span>}</td>
                        <td><StockBar plant={p} /></td>
                        <td className="mono">{fmtCurrency(p.price)} {symbol}</td>
                        <td><StatusBadge status={statusOf(p)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {low.length > 0 && (
            <section className="alert-section" style={{ marginTop: 24 }}>
              <h2 className="section-title"><I.Alert size={14} style={{ color:'var(--amber-ink)' }} /> ใกล้หมด ({low.length} รายการ)</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ต้นไม้</th><th>หมวดหมู่</th><th>สต็อก</th><th>ราคา</th><th>สถานะ</th></tr></thead>
                  <tbody>
                    {low.map(p => (
                      <tr key={p.id}>
                        <td><div className="plant-name">{p.name}</div><div className="plant-sci mono">{p.sku}</div></td>
                        <td>{p.categories && <span className="badge" style={{ background:`oklch(95% 0.03 ${p.categories.hue})`, color:`oklch(35% 0.08 ${p.categories.hue})`, borderColor:'transparent' }}>{p.categories.name_th}</span>}</td>
                        <td><StockBar plant={p} /></td>
                        <td className="mono">{fmtCurrency(p.price)} {symbol}</td>
                        <td><StatusBadge status={statusOf(p)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
