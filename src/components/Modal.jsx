import React, { useEffect } from 'react'
import { X } from './Icons'

export default function Modal({ title, children, onClose, size = 'md' }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="ปิด"><X size={14} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
