import React from 'react'

export function SkeletonBox({ width = '100%', height = 16, radius = 6, style }) {
  return (
    <div
      style={{
        width, height, borderRadius: radius,
        background: 'linear-gradient(90deg, var(--border) 0%, var(--bg) 50%, var(--border) 100%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{Array.from({ length: cols }, (_, i) => <th key={i}><SkeletonBox width={70} /></th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => <td key={c}><SkeletonBox width={c === 0 ? 36 : `${50 + (c * 13) % 40}%`} height={c === 0 ? 36 : 14} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SkeletonStats({ count = 6 }) {
  return (
    <div className="stats-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="stat">
          <SkeletonBox width={80} height={12} style={{ marginBottom: 8 }} />
          <SkeletonBox width={120} height={26} />
        </div>
      ))}
    </div>
  )
}
