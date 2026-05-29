import React, { createContext, useContext } from 'react'
import { useAuth } from './AuthContext'

// Currency lives on each store. The active currency simply follows whichever
// store the user is viewing — there is no global override, because stored
// prices are denominated in the store's own currency. Letting a user flip
// the symbol without converting numbers (or "converting" numbers we cannot
// safely assume are THB) just creates confusion.
const CurrencyCtx = createContext({ currency: 'THB', symbol: '฿' })

const SYMBOL = { THB: '฿', LAK: '₭' }

export function CurrencyProvider({ children }) {
  const { stores, currentStoreId } = useAuth()
  const currentStore = stores.find(s => s.id === currentStoreId)
  const currency = currentStore?.currency || 'THB'
  const symbol = SYMBOL[currency] || '฿'

  return (
    <CurrencyCtx.Provider value={{ currency, symbol }}>
      {children}
    </CurrencyCtx.Provider>
  )
}

export const useCurrency = () => useContext(CurrencyCtx)
