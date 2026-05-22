import React from 'react'
import { statusOf } from '../lib/utils'

export default function StockBar({ plant }) {
  const s = statusOf(plant)
  const target = Math.max(plant.min_stock * 3, 20)
  const pct = Math.min(100, (plant.stock / target) * 100)
  return (
    <div className="stock-bar">
      <span className="num-cell">{plant.stock}</span>
      <div className="bar">
        <div className={`fill ${s === 'low' ? 'fill--low' : ''} ${s === 'out' ? 'fill--out' : ''}`}
          style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  )
}
