# Sentry Error Monitoring

Wired through `src/lib/sentry.js` (init) and `ErrorBoundary` (uncaught
React errors) plus `AuthContext` (attaches the current user to events).
Stays a no-op when `VITE_SENTRY_DSN` is unset, so local dev and PR
preview builds don't spam the dashboard.

## 1. Get a DSN

1. Sign up at https://sentry.io (free tier: 5k errors/month, 1 user).
2. Create a project → choose **React** → Sentry shows the DSN. Format:
   `https://<key>@o<org>.ingest.sentry.io/<project>`.
3. Keep the project's **environment** filter at default (we tag events
   as `production` / `preview` / `development` from the client).

## 2. Set the env var

### Local dev (off by default — leave unset)

Nothing to do. The DSN is intentionally not set in `.env.local` so
exceptions print to the browser console instead of clogging Sentry.

### GitHub Pages / production builds

Inject `VITE_SENTRY_DSN` as a build-time variable in
`.github/workflows/deploy.yml`:

```yaml
- name: Build
  run: npm run build
  env:
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
    VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}
```

Then in **GitHub → Settings → Secrets and variables → Actions**, add
`VITE_SENTRY_DSN` with the DSN string.

Vite inlines `import.meta.env.VITE_*` at build time, so the DSN gets
baked into the JS bundle — that's expected and safe (DSNs are public
write tokens scoped to one project).

## 3. Verify

After the next production deploy:

1. Open browser devtools → Network and reload the app.
2. Look for a POST to `*.ingest.sentry.io/api/<project>/envelope/` —
   that's the SDK announcing itself with the session.
3. Trigger an intentional error (e.g. in browser console:
   `Sentry.captureMessage('hello from prod')`) and watch the Sentry
   dashboard issues list update within ~30s.

## 4. Quotas + sampling

`tracesSampleRate`, `replaysSessionSampleRate`, and
`replaysOnErrorSampleRate` are all `0` in `src/lib/sentry.js`. Errors
fire at 100 %. Crank up the sample rates if/when the budget allows —
the free tier only includes 5k errors and no traces or replays.

## 5. PII

`setSentryUser({ id, email })` runs in `AuthContext` when a user signs
in. If you ever need to scrub email from events, change that call to
pass only `{ id }`. Supabase URLs in breadcrumbs already get their
`apikey=` query param redacted in `beforeSend`.
