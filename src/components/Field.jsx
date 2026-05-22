import React from 'react'

export default function Field({ label, required, error, hint, fullWidth, children }) {
  return (
    <label className={`field ${fullWidth ? 'field--full' : ''}`}>
      <span className="field-label">
        {label}
        {required && <span className="req" aria-hidden="true"> *</span>}
      </span>
      {children}
      {error && <span className="field-error" role="alert">{error}</span>}
      {hint && !error && <span className="field-hint">{hint}</span>}
    </label>
  )
}
