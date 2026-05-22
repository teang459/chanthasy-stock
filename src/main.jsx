import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Auto-update service worker (silent — page picks up new code on next navigation)
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // New version available — force-reload to clear stale chunks
    if ('serviceWorker' in navigator) updateSW(true)
  },
  onOfflineReady() {},
  onRegisterError(err) { console.warn('SW register error:', err) },
})

// When Vite fails to load a lazy chunk (usually because the user is on an
// outdated index.html that references chunks that no longer exist after a
// deploy), reload the page to get the fresh manifest.
window.addEventListener('vite:preloadError', e => {
  console.warn('vite:preloadError — reloading for fresh chunks', e)
  window.location.reload()
})

// Catch any uncaught chunk load errors (Webpack/Rollup style)
window.addEventListener('error', e => {
  const msg = e?.message || ''
  if (msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Importing a module script failed')) {
    console.warn('Chunk load failure — reloading', e)
    window.location.reload()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
