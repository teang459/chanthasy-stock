import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import th from './th'
import lo from './lo'
import en from './en'

const DICTS = { th, lo, en }
export const LOCALES = [
  { code: 'th', label: 'ไทย',     short: 'TH' },
  { code: 'lo', label: 'ລາວ',     short: 'LA' },
  { code: 'en', label: 'English', short: 'EN' },
]
const STORAGE_KEY = 'cs_locale'

const Ctx = createContext({ locale: 'th', setLocale: () => {}, t: (k) => k })

function detectInitialLocale() {
  if (typeof window === 'undefined') return 'th'
  const saved = window.localStorage?.getItem(STORAGE_KEY)
  if (saved && DICTS[saved]) return saved
  const nav = (navigator.language || 'th').toLowerCase()
  if (nav.startsWith('lo')) return 'lo'
  if (nav.startsWith('en')) return 'en'
  return 'th'
}

// Walk a key like 'nav.stock' through the dictionary; fall back to TH,
// then to the key itself. The fallback chain is deterministic so
// untranslated keys are obvious in non-Thai locales without crashing.
function lookup(dict, key) {
  const parts = String(key).split('.')
  let cur = dict
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p]
    else return undefined
  }
  return typeof cur === 'string' ? cur : undefined
}

// Lightweight {placeholder} interpolation: t('foo.bar', { name: 'Alice' })
function fill(template, params) {
  if (!params || !template) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`))
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(detectInitialLocale)

  function setLocale(next) {
    if (!DICTS[next]) return
    setLocaleState(next)
    try { window.localStorage?.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
    if (typeof document !== 'undefined') document.documentElement.lang = next
  }

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale
  }, [locale])

  const t = useMemo(() => (key, params) => {
    const primary  = lookup(DICTS[locale], key)
    if (primary !== undefined) return fill(primary, params)
    const fallback = lookup(DICTS.th, key)
    if (fallback !== undefined) return fill(fallback, params)
    return key
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n() { return useContext(Ctx) }
export function useT() { return useContext(Ctx).t }
