import React from 'react'
import Modal from './Modal'

export default function Confirm({ title, desc, confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก', danger = false, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} size="sm">
      <p style={{ margin: '0 0 20px', color: 'var(--muted)', lineHeight: 1.6 }}>{desc}</p>
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onCancel}>{cancelLabel}</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  )
}
