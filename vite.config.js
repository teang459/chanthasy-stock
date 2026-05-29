import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Vercel serves the SPA from /; absolute base is required so deep
  // routes (e.g. /settings/billing) resolve assets correctly.
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'manifest.webmanifest'],
      manifest: false, // we keep manifest.webmanifest in public/ as the source of truth
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        // InvoicePDF lazy chunk is huge (~1.5 MB) and rarely opened.
        // Skip it from precache; SW will fetch it from network on first
        // download click and cache it via the default runtime handler.
        globIgnores: ['**/InvoicePDF-*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-css', expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-files', expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'supabase-storage', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
          {
            // Sarabun font for the PDF receipt — cache for a year.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/gh\/google\/fonts\/.*\.ttf/i,
            handler: 'CacheFirst',
            options: { cacheName: 'pdf-fonts', expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
        navigateFallbackDenylist: [/^\/auth\//],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
})
