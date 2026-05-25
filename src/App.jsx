import React, { useEffect, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { CurrencyProvider } from './contexts/CurrencyContext'
import Layout from './layout/Layout'
import Spinner from './components/Spinner'
import ErrorBoundary from './components/ErrorBoundary'

// Eager: auth-related (small, needed immediately)
import LoginPage         from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import MfaChallengePage  from './pages/MfaChallengePage'

// Lazy: data pages (loaded after authentication)
const DashboardPage  = lazy(() => import('./pages/DashboardPage'))
const StockPage      = lazy(() => import('./pages/StockPage'))
const LowStockPage   = lazy(() => import('./pages/LowStockPage'))
const MovementsPage  = lazy(() => import('./pages/MovementsPage'))
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'))
const SuppliersPage  = lazy(() => import('./pages/SuppliersPage'))
const CustomersPage  = lazy(() => import('./pages/CustomersPage'))
const CalendarPage   = lazy(() => import('./pages/CalendarPage'))
const ReportsPage    = lazy(() => import('./pages/ReportsPage'))
const FinancePage    = lazy(() => import('./pages/FinancePage'))
const SettlementPage = lazy(() => import('./pages/SettlementPage'))
const SettingsPage   = lazy(() => import('./pages/SettingsPage'))
const AdminPage      = lazy(() => import('./pages/AdminPage'))
const TermsPage      = lazy(() => import('./pages/TermsPage'))
const PrivacyPage    = lazy(() => import('./pages/PrivacyPage'))
const LandingPage    = lazy(() => import('./pages/LandingPage'))

function RecoveryHandler() {
  const { isRecoveryMode } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (isRecoveryMode) navigate('/reset-password', { replace: true })
  }, [isRecoveryMode])
  return null
}

function Guard({ children }) {
  const { user, loading, mfaRequired } = useAuth()
  const location = useLocation()
  if (loading) return <div className="fullscreen-center"><Spinner size={36} /></div>
  if (!user) {
    // Show public landing at root; redirect deep links to the login page.
    if (location.pathname === '/') return <LandingPage />
    return <Navigate to="/login" replace />
  }
  if (mfaRequired) return <MfaChallengePage />
  return children
}

const PageFallback = () => <div className="page-center"><Spinner size={32} /></div>

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <ToastProvider>
      <CurrencyProvider>
        <HashRouter>
          <RecoveryHandler />
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login"          element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/" element={<Guard><Layout /></Guard>}>
                <Route index              element={<DashboardPage />} />
                <Route path="stock"       element={<StockPage />} />
                <Route path="low"         element={<LowStockPage />} />
                <Route path="movements"   element={<MovementsPage />} />
                <Route path="categories"  element={<CategoriesPage />} />
                <Route path="suppliers"   element={<SuppliersPage />} />
                <Route path="customers"   element={<CustomersPage />} />
                <Route path="calendar"    element={<CalendarPage />} />
                <Route path="reports"     element={<ReportsPage />} />
                <Route path="finance"     element={<FinancePage />} />
                <Route path="settlement"  element={<SettlementPage />} />
                <Route path="settings"    element={<SettingsPage />} />
                <Route path="admin"       element={<AdminPage />} />
                <Route path="terms"       element={<TermsPage />} />
                <Route path="privacy"     element={<PrivacyPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </CurrencyProvider>
      </ToastProvider>
    </AuthProvider>
    </ErrorBoundary>
  )
}
