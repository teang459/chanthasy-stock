import React, { createContext, useContext, useState } from 'react'

const CurrencyCtx = createContext({ currency: 'THB', symbol: '฿', setCurrency: () => {} })

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(
    () => localStorage.getItem('cs_currency') || 'THB'
  )

  function setCurrency(c) {
    localStorage.setItem('cs_currency', c)
    setCurrencyState(c)
  }

  const symbol = currency === 'LAK' ? '₭' : '฿'

  return (
    <CurrencyCtx.Provider value={{ currency, setCurrency, symbol }}>
      {children}
    </CurrencyCtx.Provider>
  )
}

export const useCurrency = () => useContext(CurrencyCtx)
