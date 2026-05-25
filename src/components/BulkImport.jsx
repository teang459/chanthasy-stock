import React, { useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import Modal from './Modal'
import Spinner from './Spinner'
import { supabase } from '../lib/supabase'
import { userMessage } from '../lib/errors'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import * as I from './Icons'

// Accept several header aliases (lowercased + trimmed) per logical field.
// First entry of each list is the canonical/template name.
const FIELDS = {
  sku:       { aliases: ['sku', 'รหัส', 'รหัสสินค้า'], required: true,  label: 'SKU' },
  name:      { aliases: ['name', 'ชื่อ', 'ชื่อต้นไม้'], required: true,  label: 'ชื่อ' },
  name_sci:  { aliases: ['name_sci', 'scientific', 'ชื่อวิทยาศาสตร์'], required: false, label: 'ชื่อวิทยาศาสตร์' },
  stock:     { aliases: ['stock', 'qty', 'จำนวน', 'สต็อก'], required: true,  label: 'สต็อก', type: 'int' },
  min_stock: { aliases: ['min_stock', 'minstock', 'จำนวนต่ำสุด'], required: false, label: 'สต็อกต่ำสุด', type: 'int' },
  price:     { aliases: ['price', 'ราคา', 'ราคาขาย'], required: true,  label: 'ราคา', type: 'num' },
  cost:      { aliases: ['cost', 'ต้นทุน'], required: false, label: 'ต้นทุน', type: 'num' },
  note:      { aliases: ['note', 'หมายเหตุ'], required: false, label: 'หมายเหตุ' },
  category_code: { aliases: ['category', 'category_code', 'หมวดหมู่'], required: false, label: 'หมวดหมู่ (code)' },
  supplier_code: { aliases: ['supplier', 'supplier_code', 'ซัพพลายเออร์'], required: false, label: 'ซัพพลายเออร์ (code)' },
}

function pickField(header) {
  const h = header.trim().toLowerCase()
  for (const [field, meta] of Object.entries(FIELDS)) {
    if (meta.aliases.some(a => a.toLowerCase() === h)) return field
  }
  return null
}

function parseValue(field, raw) {
  if (raw === undefined || raw === null) return null
  const trimmed = String(raw).trim()
  if (trimmed === '') return null
  const meta = FIELDS[field]
  if (meta?.type === 'int') {
    const n = parseInt(trimmed, 10)
    return Number.isFinite(n) ? n : NaN
  }
  if (meta?.type === 'num') {
    const n = Number(trimmed.replace(/,/g, ''))
    return Number.isFinite(n) ? n : NaN
  }
  return trimmed
}

function validateRow(row) {
  const errors = []
  for (const [field, meta] of Object.entries(FIELDS)) {
    const v = row[field]
    if (meta.required && (v === null || v === undefined || v === '')) {
      errors.push(`ขาด ${meta.label}`)
      continue
    }
    if (Number.isNaN(v)) {
      errors.push(`${meta.label} ไม่ใช่ตัวเลข`)
      continue
    }
    if (meta.type === 'int' && typeof v === 'number' && v < 0) {
      errors.push(`${meta.label} ต้อง ≥ 0`)
    }
    if (meta.type === 'num' && typeof v === 'number' && v < 0) {
      errors.push(`${meta.label} ต้อง ≥ 0`)
    }
  }
  return errors
}

function downloadTemplate() {
  const headers = Object.entries(FIELDS).map(([_, m]) => m.aliases[0])
  const sample = ['ROSE-01', 'กุหลาบมอญ', 'Rosa damascena', 10, 5, 150, 80, '', '', '']
  const csv = Papa.unparse([headers, sample])
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plants-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function BulkImport({ onClose, onDone, categories = [], suppliers = [] }) {
  const { toast } = useToast()
  const { ownerId } = useAuth()
  const fileRef = useRef(null)
  const [step, setStep] = useState('upload')  // upload | preview | done
  const [rows, setRows] = useState([])         // [{ data: {...fields}, errors: [] }]
  const [headerMap, setHeaderMap] = useState({}) // { csvHeader: fieldName | null }
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)   // { inserted, failed, errors }

  const catByCode = useMemo(() => Object.fromEntries(categories.map(c => [c.code?.toLowerCase(), c.id])), [categories])
  const supByCode = useMemo(() => Object.fromEntries(suppliers.map(s => [s.code?.toLowerCase(), s.id])), [suppliers])

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.data?.length) { toast.error('CSV ว่างเปล่า'); return }
        const headers = res.meta.fields ?? []
        const map = {}
        for (const h of headers) map[h] = pickField(h)
        setHeaderMap(map)
        const parsed = res.data.map(r => {
          const obj = {}
          for (const h of headers) {
            const field = map[h]
            if (!field) continue
            obj[field] = parseValue(field, r[h])
          }
          return { data: obj, errors: validateRow(obj) }
        })
        setRows(parsed)
        setStep('preview')
      },
      error: (err) => toast.error(`อ่านไฟล์ไม่สำเร็จ: ${err.message}`),
    })
  }

  async function handleImport() {
    setImporting(true)
    const valid = rows.filter(r => r.errors.length === 0)
    const seen = new Set()
    const payload = []
    const dupes = []
    for (const r of valid) {
      const sku = r.data.sku
      if (seen.has(sku.toLowerCase())) { dupes.push(sku); continue }
      seen.add(sku.toLowerCase())
      const row = {
        owner_id: ownerId,
        sku: r.data.sku,
        name: r.data.name,
        name_sci: r.data.name_sci ?? null,
        stock: r.data.stock ?? 0,
        min_stock: r.data.min_stock ?? 5,
        price: r.data.price ?? 0,
        cost: r.data.cost ?? null,
        note: r.data.note ?? null,
      }
      if (r.data.category_code) {
        const cid = catByCode[String(r.data.category_code).toLowerCase()]
        if (cid) row.category_id = cid
      }
      if (r.data.supplier_code) {
        const sid = supByCode[String(r.data.supplier_code).toLowerCase()]
        if (sid) row.supplier_id = sid
      }
      payload.push(row)
    }

    // Insert in chunks so a single row error doesn't poison the whole batch.
    const CHUNK = 100
    let inserted = 0
    const failed = []
    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK)
      const { error, count } = await supabase.from('plants').insert(chunk, { count: 'exact' })
      if (error) {
        // Per-row retry to identify which row(s) failed
        for (const row of chunk) {
          const { error: e2 } = await supabase.from('plants').insert(row)
          if (e2) failed.push({ sku: row.sku, msg: userMessage(e2) })
          else inserted++
        }
      } else {
        inserted += count ?? chunk.length
      }
    }

    setImporting(false)
    setResult({ inserted, failed, dupes })
    setStep('done')
    onDone?.()
  }

  const validCount = rows.filter(r => r.errors.length === 0).length
  const invalidCount = rows.length - validCount

  return (
    <Modal title="นำเข้าต้นไม้จาก CSV" onClose={onClose} size="lg">
      {step === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            อัปโหลดไฟล์ CSV ที่มีคอลัมน์ <strong>sku, name, stock, price</strong> เป็นอย่างน้อย —
            คอลัมน์อื่น (name_sci, min_stock, cost, note, category, supplier) ใส่หรือไม่ใส่ก็ได้
          </p>
          <button type="button" className="btn btn-ghost" onClick={downloadTemplate}>
            <I.Download size={13} /> ดาวน์โหลด template CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            style={{ padding: 8, border: '1px dashed var(--border)', borderRadius: 8 }}
          />
        </div>
      )}

      {step === 'preview' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 13 }}>
            <span>📊 ทั้งหมด: <strong>{rows.length}</strong></span>
            <span style={{ color: 'var(--success, #16a34a)' }}>✓ ใช้งานได้: <strong>{validCount}</strong></span>
            {invalidCount > 0 && (
              <span style={{ color: 'var(--danger, #dc2626)' }}>✗ ผิดพลาด: <strong>{invalidCount}</strong></span>
            )}
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
            Header mapping: {Object.entries(headerMap).map(([h, f]) =>
              <span key={h} style={{ marginRight: 10 }}>
                <code>{h}</code> → <em>{f ?? '(ข้าม)'}</em>
              </span>
            )}
          </div>

          <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>SKU</th>
                  <th>ชื่อ</th>
                  <th>สต็อก</th>
                  <th>ราคา</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} style={{ background: r.errors.length ? 'rgba(220,38,38,0.06)' : undefined }}>
                    <td style={{ color: 'var(--muted)' }}>{i + 1}</td>
                    <td className="mono">{r.data.sku ?? ''}</td>
                    <td>{r.data.name ?? ''}</td>
                    <td className="mono">{r.data.stock ?? ''}</td>
                    <td className="mono">{r.data.price ?? ''}</td>
                    <td style={{ color: r.errors.length ? 'var(--danger, #dc2626)' : 'var(--success, #16a34a)' }}>
                      {r.errors.length ? r.errors.join(', ') : 'OK'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && (
              <div style={{ padding: 8, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                แสดง 200 แถวแรกจาก {rows.length} แถว
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setStep('upload')}>ย้อนกลับ</button>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing || validCount === 0}>
              {importing ? <Spinner size={14} color="#fff" /> : `นำเข้า ${validCount} รายการ`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>{result.failed.length === 0 ? '✅' : '⚠️'}</div>
            <h3 style={{ margin: '0 0 4px' }}>เสร็จสิ้น</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              นำเข้าสำเร็จ <strong>{result.inserted}</strong> รายการ
              {result.failed.length > 0 && <>, ล้มเหลว <strong>{result.failed.length}</strong> รายการ</>}
              {result.dupes.length > 0 && <>, ซ้ำในไฟล์ <strong>{result.dupes.length}</strong> รายการ</>}
            </p>
          </div>

          {result.failed.length > 0 && (
            <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead><tr><th>SKU</th><th>เหตุผล</th></tr></thead>
                <tbody>
                  {result.failed.map((f, i) => (
                    <tr key={i}>
                      <td className="mono">{f.sku}</td>
                      <td style={{ color: 'var(--danger, #dc2626)' }}>{f.msg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={onClose}>ปิด</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
