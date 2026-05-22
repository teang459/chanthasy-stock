import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const CurrencyCtx = createContext({ currency: 'THB', symbol: '฿', setCurrency: () => {} })

export function CurrencyProvider({ children }) {
  const { user, profile } = useAuth()
  const [currency, setCurrencyState] = useState(
    () => localStorage.getItem('cs_currency') || 'THB'
  )

  // Sync from profile when it loads
  useEffect(() => {
    if (profile?.currency && profile.currency !== currency) {
      setCurrencyState(profile.currency)
      localStorage.setItem('cs_currency', profile.currency)
    }
  }, [profile?.currency])

  async function setCurrency(c) {
    setCurrencyState(c)
    localStorage.setItem('cs_currency', c)
    if (user) {
      await supabase.from('profiles').update({ currency: c }).eq('id', user.id)
    }
  }

  const symbol = currency === 'LAK' ? '₭' : '฿'

  return (
    <CurrencyCtx.Provider value={{ currency, setCurrency, symbol }}>
      {children}
    </CurrencyCtx.Provider>
  )
}

export const useCurrency = () => useContext(CurrencyCtx)
