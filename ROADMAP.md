# Chanthasy Stock — Complete Roadmap

**Project:** Chanthasy Stock — Plant Stock Management SaaS  
**Stack:** React 18 + Vite + Supabase + GitHub Pages  
**Last Updated:** 2026-05-29  
**Current Status:** Functional but not production-ready  
**Deployment:** GitHub Pages (free) → Plan to migrate to Vercel

## Sweep 2026-05-29 — verified state vs original roadmap

Re-audited every Phase 1 + Phase 2 item against the current tree. Most "Not fixed" entries below are stale — code already matches the recommended fix. Net work this pass:

- ✅ C1 — `adjust_stock` already gates on `has_perm(store_id, …)` (schema.sql:471). Closed.
- ✅ C2 — schema.sql synced with migration 017 (FK-safe audit triggers + handle_new_user role realignment). **Edited.**
- ✅ C3 — Edge Functions now read `APP_URL`, `FROM_EMAIL`, `SUPABASE_URL` from env (LoginPage already used `window.location.origin`). **Edited.**
- ✅ C6 — prototype files (app.jsx, data.jsx, parts.jsx, tweaks-panel.jsx, icons.jsx, styles.css) are gone from the tree.
- ✅ H1 — Topbar uses `<form onSubmit>`, no per-keystroke navigation (Topbar.jsx:50-55).
- ✅ H2 — MovementsPage subscribes to `event: '*'` (MovementsPage.jsx:31).
- ✅ H4 — AdminPage builds payloads with `|| null`, never `|| undefined` (AdminPage.jsx:365-375).
- ✅ H5 — every storage cleanup `.catch` logs via console.error (StockPage.jsx:145,159,207).
- ✅ H6 — OnboardingWizard is info-only post-Phase C, no save call to error-handle.
- ✅ H7 — CalendarPage payload uses `store_id: ownerId` (CalendarPage.jsx:100).
- ✅ H8 — Confirm component has `busy` state + disabled buttons + early-return guard.
- ✅ H9 — every `postgres_changes` subscription filters on `store_id=eq.${ownerId}` (grep'd Layout/Calendar/Dashboard/Finance/LowStock/Movements/Stock).

Still open from Phase 1-2: **C4** (domain + Resend verify, requires purchase), **H3** (ReportsPage 5000 limit), **H10** (currency conversion). Old "Not fixed" labels below kept for the rest of the document but are misleading for the items above — see this section as authoritative.

---

## Executive Summary

The application has a solid foundation with most core features working:
- ✅ Multi-tenant architecture (per-store data isolation)
- ✅ Authentication with MFA + recovery
- ✅ Real-time updates (Supabase)
- ✅ PWA support + offline capability
- ✅ i18n (Thai + English)
- ✅ Dashboard & Navigation redesign (B17)
- ✅ 88/88 tests passing

**But before launching to real users, must fix:**
1. 5 critical security/data integrity issues
2. 10 high-priority bugs affecting daily use
3. Business features for SaaS model
4. Production infrastructure

---

## 🔴 PHASE 1: CRITICAL FIXES (1–2 weeks) — BLOCKING PRODUCTION

### Security & Data Integrity

#### [C1] RPC `adjust_stock()` Missing Tenant/Role Check
**Status:** ❌ Not fixed  
**Severity:** 🔴 CRITICAL SECURITY HOLE  
**File:** `supabase/schema.sql:220-241`

**Problem:**
```sql
CREATE FUNCTION adjust_stock(...) SECURITY DEFINER ...
```
- Function bypasses RLS (SECURITY DEFINER) but doesn't verify tenant or role
- User can call `supabase.rpc('adjust_stock', { p_plant_id: 'other-shop-id', ... })` to modify other shops' inventory

**Fix:**
```sql
CREATE OR REPLACE FUNCTION adjust_stock(...)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plant plants%ROWTYPE;
BEGIN
  SELECT * INTO v_plant FROM plants
   WHERE id = p_plant_id
     AND owner_id = effective_owner_id()    -- ✅ Enforce tenant
     AND can_write();                         -- ✅ Enforce role
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plant not found or not permitted' USING ERRCODE = '42501';
  END IF;
  -- ... rest of function
END;
$$;
```

**Effort:** 2 hours  
**Test:** Write test case attempting cross-tenant modification

---

#### [C2] `schema.sql` Out of Sync with Migrations
**Status:** ❌ Not fixed  
**Severity:** 🔴 CRITICAL DATA CONSISTENCY  
**File:** `supabase/schema.sql` (entire file)

**Problem:**
- `schema.sql` is the "source of truth" snapshot but missing:
  - `finance_entries` table (migration 002)
  - `log_plant_event()` trigger (migration 003)
  - `handle_new_user` old version (migration 003 updated it)
  - `adjust_stock` has security issues (C1 above)
- Fresh deployments using `schema.sql` will be inconsistent with production

**Fix:**
1. **Option A (Recommended):** Regenerate `schema.sql` to include all migrations 001-003:
   ```bash
   # Export full schema from production Supabase
   supabase db pull --schema-only
   # Then review and commit
   ```

2. **Option B:** Remove `schema.sql` and always run migrations from migration files

**Effort:** 1-2 hours  
**Test:** Deploy fresh Supabase project using schema.sql, verify it matches production

---

#### [C3] Hard-coded Production URL (Redirect & Email)
**Status:** ❌ Not fixed  
**Severity:** 🔴 BLOCKS DEVELOPMENT & CUSTOM DOMAIN  
**Files:** 
- `src/pages/LoginPage.jsx:44`
- `supabase/functions/auth-email-hook/index.ts:63`
- `supabase/functions/notify-low-stock/index.ts:81`

**Problem:**
- Dev environment sends password reset to production URL
- If custom domain bought later, must hunt down all hard-coded URLs
- Email sender uses `onboarding@resend.dev` (not professional, lands in spam)

**Fix:**

**LoginPage.jsx:**
```jsx
const REDIRECT = `${window.location.origin}${window.location.pathname}#/reset-password`
await supabase.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT })
```

**auth-email-hook/index.ts & notify-low-stock/index.ts:**
```ts
// Use environment variable for domain
const DOMAIN = Deno.env.get('CUSTOM_DOMAIN') || 'teang459.github.io/chanthasy-stock'
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'noreply@resend.dev'

await client.emails.send({
  from: FROM_EMAIL,
  to: email,
  // ...
})
```

**Effort:** 1 hour  
**Test:** Test password reset on local dev (should not redirect to production)

---

#### [C4] Email Not Domain-Verified
**Status:** ❌ Not fixed  
**Severity:** 🔴 EMAIL BLOCKED/SPAM  
**Files:** `supabase/functions/auth-email-hook/index.ts`, `notify-low-stock/index.ts`

**Problem:**
- Sender is `onboarding@resend.dev` (Resend's test domain)
- Gmail/Outlook often block or mark as spam
- No SPF/DKIM/DMARC for professional branding

**Fix:**
1. Buy domain: `.com` or `.co.th` (~500-1500 THB/year)
2. Verify domain in [Resend dashboard](https://resend.com/domains)
3. Update `FROM_EMAIL` to `noreply@yourdomain.com`
4. Set env var in Supabase → Functions config

**Effort:** 2-3 hours (including domain purchase)  
**Estimate Cost:** ~500-1500 THB/year for domain

---

#### [C5] No UNIQUE Constraint Enforcement Per Tenant
**Status:** ✅ ALREADY FIXED (migration 001)  
**Severity:** 🔴 MULTI-TENANT ISOLATION  

**Status:** Verified in schema — migration 001 converted:
```sql
-- Was: UNIQUE globally
plants.sku        TEXT NOT NULL UNIQUE

-- Now: UNIQUE per owner
CREATE UNIQUE INDEX plants_sku_per_owner ON plants(owner_id, sku)
```

**Verification:** Check `supabase/migrations/001_*.sql` ✅

---

### Code Quality

#### [C6] Dead Prototype Code in Root
**Status:** ❌ Not cleaned up  
**Severity:** 🔴 CONFUSION & MAINTENANCE  
**Files to delete:**
- `app.jsx` (1319 lines)
- `data.jsx` (133 lines)
- `parts.jsx` (250 lines)
- `tweaks-panel.jsx` (568 lines)
- `icons.jsx` (46 lines)
- `styles.css` (1080 lines)

**Problem:**
- Old monolithic prototype — `index.html` now loads `src/main.jsx`
- These files unused but present in git → confuse new contributors
- Risk: someone accidentally imports from old code

**Fix:**
```bash
# Save reference in git history
git tag -a prototype-v1 -m "Original monolithic prototype"

# Then delete
rm app.jsx data.jsx parts.jsx tweaks-panel.jsx icons.jsx styles.css
git add -A && git commit -m "Remove dead prototype code"
```

**Effort:** 30 minutes

---

## 🟠 PHASE 2: HIGH-PRIORITY BUGS (1 week) — DAILY USE IMPACT

### [H1] Topbar Search Navigates on Every Keystroke
**Status:** ❌ Not fixed  
**File:** `src/layout/Topbar.jsx:55-59`

**Problem:**
```jsx
function handleSearch(e) {
  const val = e.target.value
  setQ(val)
  if (val && location.pathname !== '/stock') navigate('/stock', { state: { search: val } })
}
```
- Typing "rose" (4 chars) = 4 navigation events
- History spam → back button broken
- Mobile: excessive re-renders

**Fix:**
```jsx
function handleSubmit(e) {
  e.preventDefault()
  if (q && location.pathname !== '/stock') {
    navigate('/stock', { state: { search: q } })
  }
}

return (
  <form onSubmit={handleSubmit}>
    <input value={q} onChange={e => setQ(e.target.value)} />
  </form>
)
```

**Effort:** 30 minutes

---

### [H2] MovementsPage Realtime Only Listens to INSERT
**Status:** ❌ Not fixed  
**File:** `src/pages/MovementsPage.jsx:28`

**Problem:**
```jsx
.on('postgres_changes', { event: 'INSERT', ... }, load)
```
- If admin deletes movement (corrects mistake), other users still see old data
- UI out of sync with reality

**Fix:**
```jsx
.on('postgres_changes', { event: '*', ... }, load)
```

**Effort:** 10 minutes

---

### [H3] ReportsPage Hardcoded 5000 Limit
**Status:** ❌ Not fixed  
**File:** `src/pages/ReportsPage.jsx:45`

**Problem:**
```jsx
let movesQ = supabase.from('movements').select(...).limit(5000)
```
- Shop with >5000 movements loses old data
- Reports/graphs incorrect

**Fix:** Replace with RPC aggregate function:
```sql
CREATE FUNCTION report_stats(
  p_owner_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
) RETURNS JSON AS $$
-- Aggregate in DB, return JSON
$$;
```

**Effort:** 2-3 hours

---

### [H4] AdminPage Sends `undefined` Values to Update
**Status:** ❌ Not fixed  
**File:** `src/pages/AdminPage.jsx:66`

**Problem:**
```jsx
.update({ role: editRole, name: editName.trim() || undefined, ... })
```
- `undefined` fields sent to Supabase → may clear values
- Edge case in some Supabase JS versions

**Fix:**
```jsx
const payload = { role: editRole, shop_name: editShop.trim() || null }
if (editName.trim()) payload.name = editName.trim()
supabase.from('profiles').update(payload).eq('id', userId)
```

**Effort:** 30 minutes

---

### [H5] Storage Cleanup Fails Silently
**Status:** ❌ Not fixed  
**File:** `src/pages/StockPage.jsx:129, 141, 186`

**Problem:**
```jsx
supabase.storage.from('plant-images').remove([path]).catch(() => {})
```
- Network/permission failures invisible
- Orphan files accumulate → wasted storage quota

**Fix:**
```jsx
.catch(err => {
  console.error('[storage cleanup failed]', path, err)
  // Send to Sentry in production
})
```

**Effort:** 30 minutes

---

### [H6] OnboardingWizard Doesn't Handle Save Errors
**Status:** ❌ Not fixed  
**File:** `src/components/OnboardingWizard.jsx:16-23`

**Problem:**
```jsx
async function saveShopName() {
  setSaving(true)
  await supabase.from('profiles').update({ shop_name: shopName }).eq('id', user.id)
  // No error checking!
  setSaving(false)
  setStep(2)
}
```
- If update fails, user still advances
- Onboarding marked complete in localStorage → won't show again
- User's shop name never saved

**Fix:**
```jsx
async function saveShopName() {
  setSaving(true)
  const { error } = await supabase.from('profiles')
    .update({ shop_name: shopName })
    .eq('id', user.id)
  
  if (error) {
    toast.error('บันทึกไม่สำเร็จ')
    setSaving(false)
    return
  }
  
  await refreshProfile?.()
  setSaving(false)
  setStep(2)
}
```

**Effort:** 1 hour

---

### [H7] CalendarPage Uses Wrong User ID
**Status:** ❌ Not fixed  
**File:** `src/pages/CalendarPage.jsx:97`

**Problem:**
```jsx
const payload = { ..., created_by: user?.id, owner_id: user?.id }
```
- Staff (with `manager_id`) creates event → event owner_id = staff's own ID
- Owner can't see/manage it

**Fix:**
```jsx
const { user, ownerId } = useAuth()
const payload = { ..., created_by: user?.id, owner_id: ownerId }
```

**Effort:** 30 minutes

---

### [H8] Delete Confirmation Not Rate-Limited
**Status:** ❌ Not fixed  
**File:** `src/components/Confirm.jsx` or `StockPage.jsx`

**Problem:**
- Confirm button doesn't disable while deleting
- User clicks multiple times → multiple delete requests sent

**Fix:**
```jsx
<button disabled={isDeleting} onClick={handleDelete}>
  {isDeleting ? 'กำลังลบ...' : 'ยืนยัน'}
</button>
```

**Effort:** 30 minutes

---

### [H9] Real-time Subscriptions Not Filtered by Owner
**Status:** ❌ PARTIALLY FIXED  
**Files:** `src/pages/DashboardPage.jsx`, `src/layout/Layout.jsx`, others

**Problem:** Some pages subscribe to `event: '*'` without `filter: owner_id=eq.${ownerId}`  
- Client receives updates for all shops (even not theirs)
- Wastes quota + slow down

**Fix:** Verify all subscriptions filter:
```jsx
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'plants',
  filter: `owner_id=eq.${ownerId}`  // ✅ Add this
}, fetchAll)
```

**Effort:** 1 hour (audit + fix all pages)

---

### [H10] Currency Display Doesn't Convert Values
**Status:** ❌ Not fixed  
**File:** `src/contexts/CurrencyContext.jsx`

**Problem:**
- Changing currency symbol ฿ → ₭ doesn't convert values
- 100 THB shows as "100 LAK" (should be ~74,500 LAK)

**Fix:**
```jsx
// Add exchange rates
const RATES = {
  THB: 1,
  LAK: 745,  // 1 THB ≈ 745 LAK
  USD: 0.028
}

function displayPrice(priceInTHB, targetCurrency) {
  return (priceInTHB * RATES[targetCurrency]).toFixed(2)
}
```

**Effort:** 1-2 hours

---

## 🟡 PHASE 3: MEDIUM-PRIORITY IMPROVEMENTS (1–2 weeks)

### Code Quality

#### [M1] Duplicate Filter/Paginate/Sort Logic
**Issue:** Same code in StockPage, MovementsPage, SuppliersPage, CategoriesPage  
**Fix:** Consolidate into `useFilteredList()` hook  
**Effort:** 2-3 hours

#### [M2] No TypeScript
**Issue:** Typos in Supabase field names caught at runtime  
**Fix:** Migrate to `.tsx` + use `supabase gen types typescript`  
**Effort:** 2-3 days  
**Priority:** Medium (can be gradual)

#### [M3] Excessive Inline Styles
**Issue:** Hundreds of `style={{...}}` in `AdminPage.jsx`, `Layout.jsx`, etc.  
**Fix:** Move to CSS classes in `index.css`  
**Effort:** 1-2 hours per file

#### [M4] No CI Test/Lint Jobs
**Issue:** `.github/workflows/deploy.yml` only runs build  
**Fix:** Add steps:
```yaml
- run: npm run lint
- run: npm test -- --run
```
**Effort:** 30 minutes

#### [M5] Low Test Coverage
**Issue:** Only 88 tests covering utilities, not business logic  
**Fix:** Add component + integration tests  
**Effort:** 3-5 days  
**Target:** >80% coverage on critical paths

#### [M6] HashRouter Limits SEO
**Issue:** URLs like `site.com/#/stock` not SEO-friendly  
**Fix:** Migrate to Vercel (supports SPA fallback) + BrowserRouter  
**Effort:** 2-3 hours (in Phase 4)

#### [M7] AuthContext Fetches AAL Too Often
**Issue:** `getAuthenticatorAssuranceLevel()` called on every session event  
**Fix:** Only call on SIGNED_IN / MFA_CHALLENGE_VERIFIED  
**Effort:** 30 minutes

#### [M8] Console.warn in Production
**Issue:** Warning logged to end-user console in production  
**Fix:** Only show during dev:
```js
if (import.meta.env.DEV && !url) {
  console.warn('⚠️ Supabase not configured')
}
```
**Effort:** 15 minutes

---

### Infrastructure

#### [I1] No Custom Domain
**Status:** ❌ Blocking production  
**Action:** Buy `.com` or `.co.th` domain  
**Cost:** ~500-1500 THB/year  
**Effort:** 1 hour setup  
**Priority:** Critical for launch

#### [I2] No Error Monitoring
**Status:** ❌ Can't see user errors  
**Action:** Install Sentry (free tier: 5K events/month)
```bash
npm install @sentry/react
# Configure in main.jsx
```
**Effort:** 1-2 hours

#### [I3] No Staging Environment
**Status:** ❌ Push to master = production  
**Action (Phase 4):** Migrate to Vercel → preview deployments on every PR  
**Effort:** 2-3 hours

---

## 🟢 PHASE 4: BUSINESS FEATURES (2–4 weeks)

### Critical for SaaS Launch

#### [B1] Billing/Subscription System
**Status:** ❌ Missing entirely  
**Required for:** Any paid tier

**Components needed:**
- Pricing page (Free/Pro/Enterprise)
- Stripe/Omise payment integration
- `subscriptions` table with status tracking
- Usage metering (count plants, storage used)
- Invoice + receipt generation
- Downgrade/cancel flow

**Effort:** 2–3 weeks  
**Cost:** Stripe fees (~2.2% + $0.30 per transaction)

---

#### [B2] VAT/Tax Support
**Status:** ❌ Missing  
**Required for:** Thai businesses registered for VAT

**Components:**
- VAT rate setting (7% Thailand)
- Separate VAT line on invoices
- Tax ID + business address fields
- Tax reports (sales tax / purchase tax)

**Effort:** 1 week

---

#### [B3] Invoice/Receipt PDF
**Status:** ❌ Only CSV export  
**Required for:** Customer-facing documents

**Implementation:**
```jsx
npm install @react-pdf/renderer
// or: use Supabase Edge Function + wkhtmltopdf
```

**Components:**
- Thai + English templates
- Sequential invoice numbering
- Signature/stamp image upload
- Print-ready layout

**Effort:** 1 week

---

#### [B4] Customer Database
**Status:** ❌ Missing entirely  
**Required for:** Multi-sell tracking

**Components:**
- `customers` table (name, phone, email, Line ID)
- Link movements → customer
- Customer sales history + LTV
- Reorder reminders

**Effort:** 1 week

---

#### [B5] Bulk Import (CSV/Excel)
**Status:** ❌ Missing  
**Required for:** Onboarding existing shops

**Implementation:**
- Upload CSV with plants data
- Column mapping UI
- Validation (SKU duplicates, invalid numbers)
- Progress bar + error reporting

**Components:**
```jsx
npm install papaparse
npm install xlsx  // for Excel support
```

**Effort:** 1 week

---

#### [B6] Barcode/QR Scanner
**Status:** ❌ Missing  
**Required for:** Fast stock adjustment

**Implementation:**
```jsx
npm install html5-qrcode
// Add Scanner button in Stock page
```

**Effort:** 2-3 days

---

#### [B7] Purchase Order Workflow
**Status:** ❌ Missing  
**Required for:** Supplier management

**Flow:**
1. Create PO → Send to supplier
2. Supplier confirms
3. Receive goods → Confirm receipt
4. Auto-adjust stock

**Components:**
- `purchase_orders` table with status tracking
- Email/SMS notification to supplier
- PO history per supplier

**Effort:** 2 weeks

---

#### [B8] Multi-Location Support (Future)
**Status:** ❌ Not in scope yet  
**For:** Shops with multiple warehouses/branches

**Requires:** `locations` + `plant_stocks(plant_id, location_id, qty)`

---

### Nice-to-Have Features

#### [B9] Batch/Lot Tracking
- Track plant generation/age
- FIFO/LIFO support
- Aged inventory reports

#### [B10] Approval Workflow
- Large adjustments require approval
- Audit trail of who approved what

#### [B11] Promotions/Discounts
- Percentage or fixed discounts
- Volume pricing
- Bundle deals

#### [B12] Loyalty Program
- Point accumulation
- Redemption flow

#### [B13] Multi-Language UI (Thai/Lao/English)
- Already done for Thai/English (B16 ✅)
- Lao support on roadmap

#### [B14] Landing Page / Marketing Site
- Features showcase
- Pricing page (when billing ready)
- Customer testimonials
- Contact form
- Demo video

---

## 📋 IMPLEMENTATION TIMELINE

### Week 1-2: PHASE 1 (Critical)
- [ ] C1: Fix adjust_stock RPC (2h)
- [ ] C2: Update schema.sql (2h)
- [ ] C3: Remove dead code (0.5h)
- [ ] C4: Dynamic redirect URLs (1h)
- [ ] C5: Buy domain + verify Resend (2h)
- [ ] I1: Setup custom domain on GitHub Pages (1h)

**Total:** ~9-10 hours

---

### Week 2: PHASE 2 (High-Priority Bugs)
- [ ] H1: Search fix (0.5h)
- [ ] H2: MovementsPage realtime (0.25h)
- [ ] H3: ReportsPage aggregate (2h)
- [ ] H4-H10: Various fixes (3-4h)

**Total:** ~6-7 hours

**Cumulative:** ~16 hours → Ready for limited beta

---

### Week 3-4: PHASE 3 (Code Quality)
- [ ] M1-M5: Refactoring & testing (8-10h)
- [ ] I2: Sentry setup (1h)

**Total:** ~10 hours

---

### Week 5-8: PHASE 4 (Business Features)
- [ ] B1: Billing system (15h)
- [ ] B2: VAT support (8h)
- [ ] B3: Invoice PDF (8h)
- [ ] B4: Customer DB (8h)
- [ ] B5: Bulk import (8h)
- [ ] B6: Scanner (3h)

**Total:** ~50 hours → Production SaaS

---

### Week 9+: PHASE 5 (Scale & Expansion)
- [ ] B7: PO workflow (15h)
- [ ] B8: Multi-warehouse (15h)
- [ ] B9: Batch tracking (10h)
- [ ] M6: Vercel migration (3h)
- [ ] B19: Mobile app (50h+)

---

## 🎯 CRITICAL PATH TO LAUNCH

```
┌─ Week 1-2: Fix Critical Issues + Get Domain
│  └─ Deploy to custom domain
├─ Week 2: Fix High-Priority Bugs
│  └─ Beta test with 3-5 shops
├─ Week 3-4: Add Billing + VAT + Invoice
│  └─ Ready for public beta
├─ Week 5+: B4 (Customers) + B5 (Import) + B6 (Scanner)
│  └─ Production SaaS with core features
└─ Month 3+: Advanced features (PO, Multi-warehouse, Mobile)
```

---

## 📊 Success Criteria

### Before Beta (End of Week 2)
- ✅ All 5 critical security issues fixed
- ✅ 10 high-priority bugs resolved
- ✅ Custom domain live
- ✅ Sentry error tracking active
- ✅ 10+ manual tests passed on all flows

### Before Production (End of Week 4)
- ✅ Billing system integrated (Stripe/Omise)
- ✅ VAT support working
- ✅ Invoice PDF generation
- ✅ Customer database
- ✅ Bulk import tested
- ✅ 100+ automated tests

### Before Scale (Month 3)
- ✅ PO workflow complete
- ✅ Mobile app / Capacitor build
- ✅ >10 paying customers
- ✅ <1% error rate
- ✅ 99.5% uptime

---

## 📝 Notes

1. **Security is #1:** C1 (RPC hole) blocks everything else
2. **Domain before beta:** Users won't share `teang459.github.io` URLs
3. **Billing before public:** Can't scale without revenue model
4. **Test as you go:** Don't batch all tests at the end
5. **User feedback:** After beta, collect feature requests for Phase 5+

---

## References

- [PRODUCTION_PLAN.md](PRODUCTION_PLAN.md) — Original requirements
- [REVIEW.md](REVIEW.md) — Detailed code audit (2026-05-24)
- [USER_GUIDE.md](USER_GUIDE.md) — End-user documentation
- [MULTI_STORE_PLAN.md](MULTI_STORE_PLAN.md) — Architecture docs
