import React, { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import Spinner from './Spinner'
import * as I from './Icons'

// Mount a Html5Qrcode instance into a fixed DOM id and emit the first
// successful scan via onDetected. The library is loaded dynamically so
// it does not bloat the initial bundle.
const REGION_ID = 'bc-scan-region'

export default function BarcodeScanner({ onDetected, onClose }) {
  const [status, setStatus] = useState('starting') // starting | running | error
  const [errorMsg, setErrorMsg] = useState('')
  const instanceRef = useRef(null)
  const stoppedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const mod = await import('html5-qrcode')
        if (cancelled) return
        const Html5Qrcode = mod.Html5Qrcode
        const scanner = new Html5Qrcode(REGION_ID, { verbose: false })
        instanceRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 160 } },
          (decodedText) => {
            if (stoppedRef.current) return
            stoppedRef.current = true
            // Stop before bubbling up so subsequent navigation/UI updates are clean
            scanner.stop().catch(() => {}).finally(() => onDetected(decodedText))
          },
          () => { /* per-frame decode failure — ignore */ },
        )
        if (!cancelled) setStatus('running')
      } catch (err) {
        if (cancelled) return
        console.error('[scanner] start failed', err)
        setErrorMsg(err?.message || 'ไม่สามารถเปิดกล้องได้')
        setStatus('error')
      }
    }
    start()

    return () => {
      cancelled = true
      const scanner = instanceRef.current
      if (scanner && !stoppedRef.current) {
        stoppedRef.current = true
        scanner.stop().catch(() => {})
      }
    }
  }, [onDetected])

  return (
    <Modal title="สแกน Barcode / QR" onClose={onClose} size="sm">
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '4 / 3',
        background: '#000',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <div id={REGION_ID} style={{ width: '100%', height: '100%' }} />
        {status === 'starting' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', gap: 8, fontSize: 13,
          }}>
            <Spinner size={14} color="#fff" /> กำลังเปิดกล้อง…
          </div>
        )}
        {status === 'error' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: '#fff', gap: 8, padding: 16, textAlign: 'center', fontSize: 13,
          }}>
            <I.Warning size={20} />
            <div>{errorMsg}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              ตรวจสอบสิทธิ์การใช้กล้องในเบราว์เซอร์
            </div>
          </div>
        )}
      </div>

      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 0', textAlign: 'center' }}>
        เล็งกล้องที่ barcode หรือ QR code ของต้นไม้
      </p>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
      </div>
    </Modal>
  )
}
