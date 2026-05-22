import React, { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { CurrencyProvider } from './contexts/CurrencyContext'
import Layout from './layout/Layout'
import LoginPage        from './pages/LoginPage'
import DashboardPage    from './pages/DashboardPage'
import StockPage        from './pages/StockPage'
import LowStockPage     from './pages/LowStockPage'
import MovementsPage    from './pages/MovementsPage'
import CategoriesPage   from './pages/CategoriesPage'
import SuppliersPage    from './pages/SuppliersPage'
import CalendarPage     from './pages/CalendarPage'
import ReportsPage      from './pages/ReportsPage'
import SettingsPage     from './pages/SettingsPage'
import SignUpPage        from './pages/SignUpPage'
import AdminPage        from './pages/AdminPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import TermsPage        from './pages/TermsPage'
import PrivacyPage      from './pages/PrivacyPage'
import Spinner from './components/Spinner'
import ErrorBoundary from './components/ErrorBoundary'

function RecoveryHandler() {
  const { isRecoveryMode } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (isRecoveryMode) navigate('/reset-password', { replace: true })
  }, [isRecoveryMode])
  return null
}

function Guard({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="fullscreen-center"><Spinner size={36} /></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <ToastProvider>
      <CurrencyProvider>
        <HashRouter>
          <RecoveryHandler />
          <Routes>
            <Route path="/login"          element={<LoginPage />} />
            <Route path="/signup"         element={<SignUpPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/" element={<Guard><Layout /></Guard>}>
              <Route index              element={<DashboardPage />} />
              <Route path="stock"       element={<StockPage />} />
              <Route path="low"         element={<LowStockPage />} />
              <Route path="movements"   element={<MovementsPage />} />
              <Route path="categories"  element={<CategoriesPage />} />
              <Route path="suppliers"   element={<SuppliersPage />} />
              <Route path="calendar"    element={<CalendarPage />} />
              <Route path="reports"     element={<ReportsPage />} />
              <Route path="settings"    element={<SettingsPage />} />
              <Route path="admin"       element={<AdminPage />} />
              <Route path="terms"       element={<TermsPage />} />
              <Route path="privacy"     element={<PrivacyPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </CurrencyProvider>
      </ToastProvider>
    </AuthProvider>
    </ErrorBoundary>
  )
}
