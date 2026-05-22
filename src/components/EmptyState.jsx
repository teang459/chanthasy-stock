import React from 'react'

export default function EmptyState({ title, desc, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">📭</div>
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {action && (
        <button className="btn btn-primary" onClick={action.onClick}>{action.label}</button>
      )}
    </div>
  )
}
