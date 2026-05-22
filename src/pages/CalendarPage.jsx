import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { MONTH_TH, DAY_TH, calDaysInMonth, calFirstDay } from '../lib/utils'
import Modal from '../components/Modal'
import Confirm from '../components/Confirm'
import Spinner from '../components/Spinner'
import Field from '../components/Field'
import * as I from '../components/Icons'

const EVENT_TYPES = [
  { value:'general',     label:'ทั่วไป',    color:'var(--accent)' },
  { value:'delivery',    label:'รับสินค้า', color:'oklch(55% 0.18 220)' },
  { value:'order',       label:'สั่งซื้อ',  color:'oklch(55% 0.18 290)' },
  { value:'reminder',    label:'เตือนความจำ',color:'var(--amber-ink)' },
  { value:'maintenance', label:'ดูแลรักษา', color:'oklch(50% 0.14 170)' },
]

const EMPTY = { title:'', date:'', time:'', type:'general', note:'' }

export default function CalendarPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [events, setEvents]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editItem, setEditItem]   = useState(null)
  const [delItem, setDelItem]     = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [errors, setErrors]       = useState({})
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    load()
    const ch = supabase.channel('calendar')
      .on('postgres_changes', { event:'*', schema:'public', table:'calendar_events' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [year, month])

  async function load() {
    const from = `${year}-${String(month+1).padStart(2,'0')}-01`
    const to   = `${year}-${String(month+1).padStart(2,'0')}-${calDaysInMonth(year,month)}`
    const { data, error } = await supabase.from('calendar_events').select('*').gte('date', from).lte('date', to).order('date').order('time', { nullsFirst: true })
    if (error) { toast.error('โหลดไม่สำเร็จ'); setLoading(false); return }
    setEvents(data ?? [])
    setLoading(false)
  }

  const eventsByDay = useMemo(() => {
    const map = {}
    events.forEach(ev => {
      const d = ev.date.split('T')[0]
      if (!map[d]) map[d] = []
      map[d].push(ev)
    })
    return map
  }, [events])

  function validate(f) {
    const e = {}
    if (!f.title?.trim()) e.title = 'กรุณาระบุหัวข้อ'
    if (!f.date)          e.date  = 'กรุณาระบุวันที่'
    return e
  }

  function openAdd(day) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    setForm({ ...EMPTY, date: dateStr })
    setErrors({})
    setEditItem(null)
    setShowForm(true)
    setSelectedDay(null)
  }

  function openEdit(ev) {
    setForm({ title:ev.title, date:ev.date, time:ev.time??'', type:ev.type, note:ev.note??'' })
    setErrors({})
    setEditItem(ev)
    setShowForm(true)
    setSelectedDay(null)
  }

  function setF(k,v) { setForm(f=>({...f,[k]:v})) }

  async function handleSave(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const payload = { title:form.title.trim(), date:form.date, time:form.time||null, type:form.type, note:form.note?.trim()||null, created_by:user?.id, owner_id:user?.id }
      if (editItem) {
        const { error } = await supabase.from('calendar_events').update(payload).eq('id', editItem.id)
        if (error) throw error
        toast.success('แก้ไข Event สำเร็จ')
      } else {
        const { error } = await supabase.from('calendar_events').insert(payload)
        if (error) throw error
        toast.success('เพิ่ม Event สำเร็จ')
      }
      setShowForm(false)
      load()
    } catch (err) { toast.error(`เกิดข้อผิดพลาด: ${err.message}`) }
    finally { setSaving(false) }
  }

  async function handleDelete(ev) {
    try {
      const { error } = await supabase.from('calendar_events').delete().eq('id', ev.id)
      if (error) throw error
      toast.success('ลบ Event สำเร็จ')
      load()
    } catch (err) { toast.error(`ลบไม่สำเร็จ: ${err.message}`) }
    setDelItem(null)
  }

  function prevMonth() { if (month === 0) { setYear(y=>y-1); setMonth(11) } else setMonth(m=>m-1) }
  function nextMonth() { if (month === 11) { setYear(y=>y+1); setMonth(0) } else setMonth(m=>m+1) }

  const daysInMonth = calDaysInMonth(year, month)
  const firstDay    = calFirstDay(year, month)
  const todayStr    = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

  const dayEvts = selectedDay ? (eventsByDay[`${year}-${String(month+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`] ?? []) : []

  if (loading) return <div className="page-center"><Spinner size={32} /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">ปฏิทิน</h1><p className="page-sub">{MONTH_TH[month]} {year + 543}</p></div>
        <button className="btn btn-primary" onClick={() => openAdd(now.getDate())}><I.Plus size={13} /> เพิ่ม Event</button>
      </div>

      {/* Month navigation */}
      <div className="cal-nav">
        <button className="icon-btn" onClick={prevMonth}><I.ChevronL size={16} /></button>
        <span className="cal-month">{MONTH_TH[month]} {year + 543}</span>
        <button className="icon-btn" onClick={nextMonth}><I.Chevron size={16} /></button>
        <button className="btn btn-ghost" style={{ marginLeft: 8, fontSize: 12 }} onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}>วันนี้</button>
      </div>

      {/* Legend */}
      <div className="cal-legend">
        {EVENT_TYPES.map(t => (
          <span key={t.value} className="cal-legend-item">
            <span className="cal-dot" style={{ background: t.color }} />
            {t.label}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="cal-grid">
        {DAY_TH.map(d => <div key={d} className="cal-day-label">{d}</div>)}
        {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} className="cal-cell cal-cell--empty" />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const dayEventsAll = eventsByDay[dateStr] ?? []
          const isToday = dateStr === todayStr
          const isSel   = selectedDay === day
          return (
            <div
              key={day}
              className={`cal-cell ${isToday ? 'cal-cell--today' : ''} ${isSel ? 'cal-cell--selected' : ''} ${dayEventsAll.length ? 'cal-cell--has-events' : ''}`}
              onClick={() => setSelectedDay(isSel ? null : day)}
            >
              <span className="cal-day-num">{day}</span>
              <div className="cal-events-mini">
                {dayEventsAll.slice(0,3).map(ev => {
                  const t = EVENT_TYPES.find(x=>x.value===ev.type)
                  return <span key={ev.id} className="cal-event-dot" style={{ background: t?.color ?? 'var(--accent)' }} title={ev.title} />
                })}
                {dayEventsAll.length > 3 && <span className="cal-more">+{dayEventsAll.length-3}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Day events panel */}
      {selectedDay && (
        <div className="day-panel">
          <div className="day-panel-header">
            <span>{selectedDay} {MONTH_TH[month]} {year+543}</span>
            <button className="btn btn-primary" style={{ fontSize:12, padding:'4px 10px' }} onClick={() => openAdd(selectedDay)}><I.Plus size={12} /> เพิ่ม</button>
          </div>
          {dayEvts.length === 0 ? (
            <div className="day-panel-empty">ไม่มี Event วันนี้ คลิก "เพิ่ม" เพื่อเพิ่ม</div>
          ) : (
            dayEvts.map(ev => {
              const t = EVENT_TYPES.find(x=>x.value===ev.type)
              return (
                <div key={ev.id} className="day-event">
                  <div className="day-event-bar" style={{ background: t?.color }} />
                  <div className="day-event-body">
                    <div className="day-event-title">{ev.title}</div>
                    {ev.time && <div className="day-event-time">{ev.time}</div>}
                    {ev.note && <div className="day-event-note">{ev.note}</div>}
                    <div className="day-event-type">{t?.label}</div>
                  </div>
                  <div className="day-event-actions">
                    <button className="icon-btn" onClick={() => openEdit(ev)}><I.Edit size={12} /></button>
                    <button className="icon-btn danger" onClick={() => setDelItem(ev)}><I.Trash size={12} /></button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {showForm && (
        <Modal title={editItem ? 'แก้ไข Event' : 'เพิ่ม Event'} onClose={() => setShowForm(false)} size="sm">
          <form onSubmit={handleSave} className="form-stack">
            <Field label="หัวข้อ" required error={errors.title}>
              <input value={form.title} onChange={e => setF('title',e.target.value)} placeholder="ชื่อกิจกรรม" autoFocus />
            </Field>
            <Field label="วันที่" required error={errors.date}>
              <input type="date" value={form.date} onChange={e => setF('date',e.target.value)} />
            </Field>
            <Field label="เวลา">
              <input type="time" value={form.time} onChange={e => setF('time',e.target.value)} />
            </Field>
            <Field label="ประเภท">
              <select value={form.type} onChange={e => setF('type',e.target.value)}>
                {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="หมายเหตุ">
              <textarea rows={2} value={form.note} onChange={e => setF('note',e.target.value)} placeholder="รายละเอียดเพิ่มเติม..." />
            </Field>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Spinner size={14} color="#fff" /> : editItem ? 'บันทึก' : 'เพิ่ม'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {delItem && (
        <Confirm title="ลบ Event" danger desc={`ลบ "${delItem.title}"?`}
          confirmLabel="ลบ" onConfirm={() => handleDelete(delItem)} onCancel={() => setDelItem(null)}
        />
      )}
    </div>
  )
}
