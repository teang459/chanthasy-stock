# Vercel Deployment Setup

The repo now ships with `vercel.json` (SPA rewrite + immutable cache for
`/assets/*`, no-cache for the PWA `sw.js`). HashRouter is gone — every
route is a real path now (`/settings`, `/pricing`, etc.), which means
Vercel's SPA fallback is required for direct navigation.

The old GitHub Pages workflow is still in `.github/workflows/deploy.yml`
but its trigger is `workflow_dispatch` only — pushes no longer auto-
deploy there.

## 1. Link the repo

1. Sign in at https://vercel.com with the GitHub account that owns
   `teang459/chanthasy-stock`.
2. **Add New → Project → Import** `chanthasy-stock`.
3. Vercel auto-detects Vite. Confirm:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build` (already in `vercel.json`)
   - **Output Directory:** `dist`
4. Don't deploy yet — set env vars first.

## 2. Environment variables

Under **Project → Settings → Environment Variables**, add for both
**Production** and **Preview** environments:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://kdsjqsfiunjhnajstwgi.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | (anon key from Supabase dashboard) |
| `VITE_SENTRY_DSN` | (optional — Sentry DSN; leave blank to disable) |

Vite inlines these at build time, so previews and production each get
their own bake.

## 3. First deploy

Click **Deploy**. Vercel:

* Runs `npm install` and `npm run build`.
* Picks up `vercel.json` for routing + headers.
* Returns a `*.vercel.app` URL once green.

Every PR from now on gets its own preview URL automatically.

## 4. Update Supabase / Stripe env

The Edge Functions read `APP_URL` to build redirect targets (password
reset email, Stripe checkout success / cancel, billing portal return).
Point it at the new origin:

```
APP_URL = https://<your-vercel-project>.vercel.app
```

Update under **Supabase → Project Settings → Edge Functions → Secrets**.

Also re-run the Stripe webhook test in Stripe Dashboard so it confirms
the endpoint is still reachable.

## 5. Custom domain (when ready)

When the domain (I1) is purchased:

1. **Vercel → Domains → Add** `chanthasystock.com` (or whatever).
2. Vercel shows the DNS records to add at the registrar.
3. After verification, set `APP_URL` to the custom domain in Supabase.
4. Update the Stripe webhook endpoint URL.
5. (Optional) Add the domain to Sentry's allowed domains.

## 6. Rolling back to GitHub Pages

If Vercel ever needs to drop:

1. `.github/workflows/deploy.yml` — change `on:` back to:
   ```yaml
   on:
     push:
       branches: [master]
   ```
2. `vite.config.js` — flip `base: '/'` back to `base: './'`.
3. `src/App.jsx` — swap `BrowserRouter` for `HashRouter`.
4. Edge Functions — restore the `/#/` prefix on `success_url`,
   `cancel_url`, `return_url`, and the password-reset redirect.

Each of those is intentionally small to keep rollback cheap.
