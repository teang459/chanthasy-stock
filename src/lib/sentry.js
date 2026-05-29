// Sentry error monitoring.
//
// Initialized as early as possible (before React renders) so even
// boot-time errors get captured. Stays a no-op when VITE_SENTRY_DSN
// isn't set — keeps local dev quiet and avoids any sample data leaking
// during preview deploys.
//
// Release tag mirrors package.json version so issues in production can
// be tied back to a build; environment splits prod from preview based
// on hostname.

import * as Sentry from '@sentry/react'
import pkg from '../../package.json'

const DSN = import.meta.env.VITE_SENTRY_DSN

function detectEnvironment() {
  if (import.meta.env.DEV) return 'development'
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  if (host.includes('github.io') || host === 'chanthasy-stock.com') return 'production'
  return 'preview'
}

let initialized = false

export function initSentry() {
  if (initialized) return
  if (!DSN) {
    if (import.meta.env.DEV) {
      console.info('[sentry] VITE_SENTRY_DSN not set — error monitoring disabled')
    }
    return
  }

  Sentry.init({
    dsn: DSN,
    environment: detectEnvironment(),
    release: `chanthasy-stock@${pkg.version}`,

    // Browser performance + replay are nice-to-have but eat the 5k
    // events/mo free quota fast. Start with errors only; turn these
    // on later if the budget allows.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Drop noisy expected errors that don't need triage.
    ignoreErrors: [
      // Browser extensions firing in the same window
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // PWA chunk reload path is handled in main.jsx
      'Failed to fetch dynamically imported module',
      'Loading chunk',
      'Importing a module script failed',
    ],

    beforeSend(event, _hint) {
      // Strip the Supabase anon key from URLs if it ever leaks into a
      // breadcrumb (it appears in the apikey query string on REST calls)
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/apikey=[^&]+/, 'apikey=REDACTED')
      }
      return event
    },
  })

  initialized = true
}

export function captureError(err, context) {
  if (!initialized) return
  Sentry.captureException(err, context ? { extra: context } : undefined)
}

export function setSentryUser(user) {
  if (!initialized) return
  if (!user) { Sentry.setUser(null); return }
  Sentry.setUser({ id: user.id, email: user.email })
}

export { Sentry }
