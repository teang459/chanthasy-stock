import React from 'react'
import { useI18n, LOCALES } from '../i18n'

// Pill-style toggle group. Used in Settings and (in compact mode) the
// public Landing page.
export default function LanguageSwitcher({ compact = false }) {
  const { locale, setLocale } = useI18n()
  return (
    <div role="group" aria-label="Language" style={{
      display: 'inline-flex',
      border: '1px solid var(--border)',
      borderRadius: 999,
      overflow: 'hidden',
      background: 'var(--surface)',
    }}>
      {LOCALES.map(l => {
        const active = locale === l.code
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLocale(l.code)}
            aria-pressed={active}
            style={{
              border: 0,
              padding: compact ? '4px 10px' : '6px 14px',
              fontSize: compact ? 12 : 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: active ? 'var(--primary, oklch(50% 0.18 145))' : 'transparent',
              color: active ? '#fff' : 'var(--muted)',
            }}
          >
            {compact ? l.short : l.label}
          </button>
        )
      })}
    </div>
  )
}
