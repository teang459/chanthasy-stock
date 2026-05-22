import React from 'react'
import { statusLabel } from '../lib/utils'

export default function StatusBadge({ status }) {
  const cls = status === 'out' ? 'badge--out' : status === 'low' ? 'badge--low' : 'badge--ok'
  return (
    <span className={`badge ${cls}`}>
      <span className="dot" />
      {statusLabel(status)}
    </span>
  )
}
