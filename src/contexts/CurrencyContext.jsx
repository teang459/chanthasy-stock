import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

const CurrencyCtx = createContext({ currency: 'THB', symbol: '฿', setCurrency: () => {} })

// Currency now lives on the store. Each store has its own currency (THB/LAK);
// the active currency follows whichever store the user is currently viewing.
// localStorage keeps a fallback for first paint before stores load.
export function CurrencyProvider({ children }) {
  const { stores, currentStoreId } = useAuth()
  const [currency, setCurrencyState] = useState(
    () => localStorage.getItem('cs_currency') || 'THB'
  )

  const currentStore = stores.find(s => s.id === currentStoreId)

  useEffect(() => {
    const next = currentStore?.currency
    if (next && next !== currency) {
      setCurrencyState(next)
      localStorage.setItem('cs_currency', next)
    }
  }, [currentStore?.currency, currency])

  // Manual override for testing / user preference.
  // Persists locally only; store currency is the source of truth.
  function setCurrency(c) {
    setCurrencyState(c)
    localStorage.setItem('cs_currency', c)
  }

  const symbol = currency === 'LAK' ? '₭' : '฿'

  return (
    <CurrencyCtx.Provider value={{ currency, setCurrency, symbol }}>
      {children}
    </CurrencyCtx.Provider>
  )
}

export const useCurrency = () => useContext(CurrencyCtx)
