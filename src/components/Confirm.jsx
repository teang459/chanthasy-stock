import React, { useState } from 'react'
import Modal from './Modal'
import Spinner from './Spinner'

export default function Confirm({ title, desc, confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก', danger = false, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false)
  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    try { await onConfirm() }
    finally { setBusy(false) }
  }
  return (
    <Modal title={title} onClose={busy ? undefined : onCancel} size="sm">
      <p style={{ margin: '0 0 20px', color: 'var(--muted)', lineHeight: 1.6 }}>{desc}</p>
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={handleConfirm} disabled={busy}>
          {busy ? <Spinner size={14} color="#fff" /> : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
