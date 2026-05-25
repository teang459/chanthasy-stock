# รายงานตรวจสอบโครงการ Chanthasy Stock

**โครงการ:** Chanthasy Stock — ระบบจัดการสต็อกต้นไม้ (Multi-tenant SaaS)
**Stack:** React 18 + Vite + Supabase (Postgres + Auth + Storage + Edge Functions) + GitHub Pages
**วันที่ตรวจสอบ:** 2026-05-24
**ผู้ตรวจ:** Claude (Opus 4.7)
**ขอบเขต:** ตรวจทั้ง code, schema, edge functions, business model

---

## สรุปภาพรวม

โครงการอยู่ในสถานะ **"ใช้งานได้แต่ยังไม่พร้อม production จริง"**

จากการเทียบกับ `PRODUCTION_PLAN.md` (เขียนไว้เมื่อ 2026-05-22) — งาน Critical ส่วนใหญ่ทำเสร็จแล้ว เช่น

- UNIQUE per-owner (migration 001) ✅
- RLS policies + helper functions (`effective_owner_id`, `can_write`, `can_delete`, `is_admin`) ✅
- `userMessage()` error mapper ✅
- Realtime filter by `owner_id` ✅
- Currency sync to DB ✅
- Onboarding skip for staff ✅
- Image compression + cleanup ✅
- MFA enrollment + challenge ✅
- PWA + skeleton loaders ✅
- Admin create/delete via Edge Function ✅

แต่ยังมีจุดที่ **ต้องแก้ก่อนเปิดผู้ใช้จริงในวงกว้าง** และมี **ฟีเจอร์ทางธุรกิจที่ขาด** สำหรับการเป็น SaaS เชิงพาณิชย์เต็มรูปแบบ

ระดับความสำคัญที่ใช้ในรายงาน:

| ระดับ | ความหมาย |
|---|---|
| 🔴 Critical | ต้องแก้ก่อนรับผู้ใช้จริง — security / data loss risk |
| 🟠 High | กระทบการใช้งานรายวันหรือความน่าเชื่อถือ |
| 🟡 Medium | คุณภาพโค้ด / DX / UX ที่ควรปรับปรุง |
| 🟢 Low | Nice-to-have สำหรับเติบโตในระยะถัดไป |

---

## ส่วนที่ 1 — ปัญหาด้าน Code

### 🔴 C1. RPC `adjust_stock` ไม่ตรวจสิทธิ์เขียนภายในฟังก์ชัน

**ไฟล์:** `supabase/schema.sql` บรรทัด 220-241

ฟังก์ชันถูกประกาศเป็น `SECURITY DEFINER` ซึ่ง **bypass RLS ทั้งหมด** แล้วใช้แค่ `auth.uid()` เป็นผู้บันทึก — แต่ไม่ตรวจสอบเลยว่าผู้เรียก:

1. มีสิทธิ์ใน plant นั้น (อาจเป็น plant ของร้านอื่น)
2. มี role ที่อนุญาตให้แก้ stock (`viewer` ห้ามแก้)

**ผลกระทบ:** ผู้ใช้ที่ login แล้วและรู้ `plant_id` ของร้านอื่น (เช่นจาก network log) สามารถเรียก `supabase.rpc('adjust_stock', { p_plant_id: '<id-ร้านอื่น>', ... })` แล้วแก้สต็อกร้านอื่นได้

**แก้:**
```sql
CREATE OR REPLACE FUNCTION adjust_stock(...)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plant plants%ROWTYPE;
BEGIN
  SELECT * INTO v_plant FROM plants
   WHERE id = p_plant_id
     AND owner_id = effective_owner_id()    -- ✅ enforce tenant
     AND can_write();                        -- ✅ enforce role
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plant not found or not permitted' USING ERRCODE = '42501';
  END IF;
  -- ... เหมือนเดิม
END;
$$;
```

---

### 🔴 C2. `schema.sql` ยังเป็นเวอร์ชันเก่า ไม่ตรงกับ DB จริง

**ไฟล์:** `supabase/schema.sql`

ปัญหา:
- `schema.sql` มี `adjust_stock` แบบที่ตรวจสิทธิ์ไม่พอ (ดู C1)
- ไม่มี `finance_entries` table (อยู่ใน migration 002)
- ไม่มี `log_plant_event()` trigger ที่ถูกใช้ใน production (อยู่ใน migration 003)
- `handle_new_user` ยังเป็นเวอร์ชันเก่า (migration 003 แก้ไขแล้ว)

**ผลกระทบ:** ถ้านำ `schema.sql` ไป deploy บน Supabase project ใหม่ จะได้สถานะที่ **ไม่เหมือน production**

**แก้:** อัปเดต `schema.sql` ให้รวมเนื้อหา migration 001–003 ทั้งหมด เพื่อให้ deploy ใหม่ได้สถานะตรงกัน หรือเปลี่ยน policy ให้ใช้แค่ migrations แล้วลบ `schema.sql` ทิ้ง

---

### 🔴 C3. มี Dead Code Prototype ที่ root อาจสร้างความสับสน

**ไฟล์:**
```
app.jsx           1319 บรรทัด
data.jsx           133 บรรทัด
parts.jsx          250 บรรทัด
tweaks-panel.jsx   568 บรรทัด
icons.jsx           46 บรรทัด
styles.css        1080 บรรทัด
```

ไฟล์เหล่านี้เป็นต้นแบบโมโนลิธเดิม — `index.html` ปัจจุบันโหลด `src/main.jsx` แทน ทำให้ **ไฟล์เหล่านี้ไม่ถูกใช้งานจริง** แต่:

- ถูก commit เข้า git → สับสน contributor ใหม่
- ถ้ามีใครเปลี่ยน `index.html` ไป import `app.jsx` โดยไม่ได้ตั้งใจ → ใช้โค้ดเก่า

**แก้:** ลบทิ้งทั้งหมด (ตรวจ git log ก่อนเพื่อเก็บไว้เป็น tag เผื่อย้อนดู)

---

### 🔴 C4. Hard-coded URL สำหรับ password reset

**ไฟล์:** `src/pages/LoginPage.jsx:44`

```jsx
await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
  redirectTo: 'https://teang459.github.io/chanthasy-stock',
})
```

**ผลกระทบ:**
- รัน local dev → คลิกลิงก์ reset จะเด้งไป production
- ถ้าซื้อ custom domain ในอนาคต → ต้องไล่หา hard-coded URL ทั้งหมด

**แก้:**
```jsx
const REDIRECT = `${window.location.origin}${window.location.pathname}#/reset-password`
await supabase.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT })
```

---

### 🔴 C5. Email sender ใช้ `onboarding@resend.dev` (domain ที่ไม่ได้ verify)

**ไฟล์:** `supabase/functions/auth-email-hook/index.ts:63`, `notify-low-stock/index.ts:81`

`onboarding@resend.dev` เป็น default sender ของ Resend สำหรับการทดสอบ — **ไม่เหมาะกับ production** เพราะ:
- Gmail/Outlook มักโยนเข้า spam หรือ block เลย
- ไม่มี SPF/DKIM/DMARC ของโดเมนคุณ
- หน้าตา branding ดูไม่น่าเชื่อถือ

**แก้:** ซื้อโดเมน เช่น `chanthasy.com` → verify ใน Resend → แก้ sender เป็น `noreply@chanthasy.com`

---

### 🟠 H1. Topbar search trigger navigation ทุก keystroke

**ไฟล์:** `src/layout/Topbar.jsx:55-59`

```jsx
function handleSearch(e) {
  const val = e.target.value
  setQ(val)
  if (val && location.pathname !== '/stock') navigate('/stock', { state: { search: val } })
}
```

ผลกระทบ:
- พิมพ์ "rose" 4 ตัวอักษร = navigate 4 ครั้ง (history spam)
- ทำให้ back button ใช้งานยาก
- บนมือถือสะดุดเพราะ re-render มหาศาล

**แก้:** ใช้ debounce หรือรอ Enter:
```jsx
function handleSubmit(e) {
  e.preventDefault()
  if (q && location.pathname !== '/stock') navigate('/stock', { state: { search: q } })
}
// wrap input ใน <form onSubmit={handleSubmit}>
```

---

### 🟠 H2. MovementsPage realtime ฟังแค่ INSERT

**ไฟล์:** `src/pages/MovementsPage.jsx:28`

```jsx
.on('postgres_changes', { event: 'INSERT', ... }, load)
```

ถ้า admin ลบ movement (เช่นแก้ผิด) ผู้ใช้คนอื่นที่เปิดหน้าค้างไว้ยังเห็นรายการเดิม — UI ไม่ sync

**แก้:** เปลี่ยนเป็น `event: '*'` (เหมือนหน้าอื่น) หรือยอมรับ trade-off นี้แล้วใส่ปุ่ม Refresh

---

### 🟠 H3. ReportsPage limit 5000 movements ตายตัว

**ไฟล์:** `src/pages/ReportsPage.jsx:45`

```jsx
let movesQ = supabase.from('movements').select(...).limit(5000)
```

ถ้าเลือก range `1 ปี` หรือ `ทั้งหมด` และร้านมี movements > 5000 → ข้อมูลเก่าจะหาย → กราฟ/Top 10 ผิด

**แก้:** อาจใช้ aggregate ที่ฝั่ง DB (RPC) แทนการดึง raw rows มาคำนวณ frontend
```sql
CREATE FUNCTION report_stats(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ) RETURNS JSON ...
```

---

### 🟠 H4. AdminPage update `name: undefined`

**ไฟล์:** `src/pages/AdminPage.jsx:66`

```jsx
.update({ role: editRole, name: editName.trim() || undefined, ... })
```

Supabase JS จะส่ง field ที่เป็น `undefined` ออกไปด้วย → ในบาง edge case อาจล้าง name เป็น empty string

**แก้:** สร้าง payload conditionally:
```jsx
const payload = { role: editRole, shop_name: editShop.trim() || null }
if (editName.trim()) payload.name = editName.trim()
```

---

### 🟠 H5. Storage cleanup ใช้ `.catch(() => {})` แบบเงียบ

**ไฟล์:** `src/pages/StockPage.jsx:129, 141, 186`

```jsx
supabase.storage.from('plant-images').remove([path]).catch(() => {})
```

ถ้า cleanup ล้มเหลว (network, permission, race) → ไฟล์ orphan สะสม ไม่มีใครรู้

**แก้:** อย่างน้อย log ลง Sentry/console.error เพื่อสะสมเป็น metric:
```jsx
.catch(err => console.error('[storage cleanup]', path, err))
```

หรือทำ cron job รายเดือนใน Edge Function ที่ list ทุก storage path แล้วเทียบกับ `plants.image_url` → ลบที่ orphan

---

### 🟠 H6. OnboardingWizard ไม่ handle error ของ save

**ไฟล์:** `src/components/OnboardingWizard.jsx:16-23`

```jsx
async function saveShopName() {
  if (!shopName.trim()) return
  setSaving(true)
  await supabase.from('profiles').update({ shop_name: shopName.trim() }).eq('id', user.id)
  await refreshProfile?.()
  setSaving(false)
  setStep(2)
}
```

ถ้า update fail (network, RLS) → ผู้ใช้เห็น "บันทึกแล้ว" แต่จริงๆ ไม่ได้บันทึก → ไป step 2 → onboarding ถูก mark done ใน localStorage แล้ว → จะไม่ขึ้นอีก

**แก้:** ตรวจ `{ error }` แล้วโชว์ toast/error message; ถ้าไม่ผ่านอย่าก้าวต่อ

---

### 🟠 H7. `dist/` ถูก commit เข้า git

**สังเกตเห็น:** `gitignore` มี `dist/` แต่ folder `dist/` ยังปรากฏใน working tree — ต้องตรวจว่าใน history มี `dist/` หลงเข้าไปหรือไม่ ถ้ามีให้ rewrite history (กรณีเป็น repo private) หรือยอมรับเพราะเป็น public artifact

---

### 🟡 M1. Duplicate code: filter + paginate + sort ในทุกหน้า

`StockPage`, `MovementsPage`, `SuppliersPage`, `CategoriesPage` มี logic ซ้ำ:
- useMemo filter
- useEffect setPage(0) on filter change
- paged slice
- pagination JSX

`src/lib/useFilteredList.js` มีอยู่แล้วแต่ดูเหมือนยังไม่ถูกใช้ครบทุกหน้า — refactor ให้ทุกหน้าใช้ hook นี้

---

### 🟡 M2. ไม่มี TypeScript

- Supabase response เป็น `any[]` หมด → typo ใน field name จะเจอตอน runtime
- ไม่มี `supabase gen types typescript` เพื่อ sync schema ↔ frontend

**แก้:** ค่อยๆ migrate ไป `.tsx` หรืออย่างน้อยกำหนด JSDoc types สำหรับ Supabase rows

---

### 🟡 M3. Inline styles เยอะมาก

`Layout.jsx`, `AdminPage.jsx`, `OnboardingWizard.jsx`, `Topbar.jsx`, `Modal.jsx` — มี inline `style={{...}}` หลายสิบที่ → อ่านยาก ทดสอบยาก ไม่ tree-shake

**แก้:** ย้ายไป CSS class ใน `index.css` หรือ adopt CSS Modules

---

### 🟡 M4. ไม่มี CI test/lint

`.github/workflows/deploy.yml` รัน build อย่างเดียว ไม่ run `npm test` หรือ `npm run lint`

**แก้:** เพิ่ม job ก่อน build:
```yaml
- run: npm run lint
- run: npm test
```

---

### 🟡 M5. Test coverage น้อย

มีแค่ `errors.test.js`, `image.test.js`, `utils.test.js` — ไม่มี:
- Component test (LoginPage, StockPage, AdminPage)
- Integration test (auth flow, role boundary, multi-tenant isolation)

ระดับ test ปัจจุบันป้องกัน utility regression แต่ไม่ป้องกัน business regression

---

### 🟡 M6. HashRouter จำกัด SEO และดูไม่ professional

ทุก URL จะเป็น `https://site.com/#/stock` — ใช้เพราะ GitHub Pages ไม่รองรับ SPA fallback

**แก้:** ย้ายไป Vercel หรือ Cloudflare Pages (ฟรี + รองรับ SPA fallback) → ใช้ BrowserRouter ได้ → URL สะอาด + SEO-friendly

---

### 🟡 M7. AuthContext fetch AAL ทุกครั้งที่ session เปลี่ยน

`processSession` เรียก `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` ทุกครั้ง — แม้แต่ TOKEN_REFRESH ที่ไม่ควรเปลี่ยน MFA state

**แก้:** เช็ค event type ใน listener ก่อนเรียก AAL — เรียกแค่ SIGNED_IN / MFA_CHALLENGE_VERIFIED

---

### 🟡 M8. `console.warn` ใน production code (`src/lib/supabase.js:7`)

```js
if (!url || !key || url.includes('your-project-id')) {
  console.warn('⚠️ Supabase ยังไม่ได้ตั้งค่า — ตรวจสอบ .env.local')
}
```

ดี ไม่อันตราย แต่ถ้าเปิดใน production จะมี warning ใน console ของ end-user — ใช้ env check แล้ว throw ในตอน dev เท่านั้น

---

### 🟢 L1. Bundle size

หลังแบ่ง lazy import แล้วลด initial bundle ลง แต่ยังมี `@supabase/supabase-js` ~80KB gzip — พิจารณาใช้ Supabase REST client แบบ lightweight ถ้าจำเป็น

---

### 🟢 L2. ไม่มี Error Tracking + Analytics

- Sentry / PostHog → log error จาก ErrorBoundary และ Edge Function
- รู้ว่าผู้ใช้คลิกฟีเจอร์ไหนบ่อย (เก็บ data ก่อนจะตัดสินใจ feature roadmap)

---

### 🟢 L3. ไม่มี Rate Limiting บน Edge Function

`admin-manage-users` เปิด CORS `*` + ตรวจ JWT — ป้องกัน unauthorized ได้ แต่ admin ที่ rogue สามารถสร้าง user สแปม
แนะนำใส่ rate limit (เช่น 10 calls / นาที / IP) ผ่าน Upstash Ratelimit หรือ Supabase Edge built-in

---

### 🟢 L4. realtime channel name ใช้ template literal ดีแล้ว แต่ไม่ unsubscribe เมื่อ admin switch shop ใน Layout

ที่จริง `useEffect([ownerId])` re-run แล้ว cleanup ทันที — OK แต่ Layout มี channel แค่ `layout-plants-${ownerId}` ส่วน Dashboard/Stock/Movements ก็แยก channel — ดี แต่จำนวน concurrent channels อาจเกิน free tier (ปัจจุบัน 200) ถ้าผู้ใช้พร้อมกัน

---

## ส่วนที่ 2 — ปัญหาด้าน Business

### 🔴 B1. ไม่มีระบบ Billing / Subscription

ปัจจุบันทุกบัญชีใช้งานได้ฟรีและไม่จำกัด — เป็นต้นทุน Supabase ที่คุณแบกเองทั้งหมด

ถ้าจะทำเป็น SaaS เชิงพาณิชย์ต้องมี:
- Pricing tier (เช่น Free: 100 plants / Pro: ไม่จำกัด / Enterprise: multi-shop)
- Payment integration (Stripe Thailand, Omise, 2C2P)
- Subscription state ใน DB
- Usage metering (count plants/storage/movements)
- Downgrade/upgrade flow + invoice history

**สถานะปัจจุบัน:** ตาราง `subscriptions` ถูกลบไปแล้ว (ดู migration 003 comment) → ต้องเริ่มออกแบบใหม่

---

### 🔴 B2. ไม่มีการคำนวณภาษี / VAT

สำหรับร้านค้าไทยที่จดทะเบียน VAT (รายได้ > 1.8M/ปี) ต้องการ:
- คอลัมน์ VAT (7%) แยกในใบขาย
- รายงานภาษีขาย / ภาษีซื้อ
- เลขผู้เสียภาษี + ที่อยู่ออกใบกำกับภาษี

ปัจจุบันระบบไม่รองรับเลย → ใช้งานจริงต้องไปทำใน Excel แยก

---

### 🔴 B3. ไม่มี Invoice / Receipt (ใบเสร็จ / ใบกำกับภาษี) แบบ PDF พิมพ์ได้

ระบบการเงินมีแค่ CSV export — ลูกค้าซื้อจริงต้องการใบเสร็จกระดาษหรือ PDF

แนะนำเพิ่ม:
- Template ใบเสร็จไทย-อังกฤษ
- เลขที่ใบเสร็จ running (เป็น sequence ต่อ owner_id)
- เก็บลายเซ็น/ตราประทับ (ภาพ) ใน profile
- Generate PDF ผ่าน `@react-pdf/renderer` หรือ Edge Function (HTML→PDF)

---

### 🟠 B4. ไม่มีฐานข้อมูลลูกค้า (Customer)

ตอนนี้บันทึก "ขายต้นไม้" จะเข้าเป็น `movement.type='out'` กับ note อิสระ → ไม่รู้ว่าใครซื้อ ซื้อกี่ครั้ง ซื้อรวมเท่าไร

ฟีเจอร์ที่ขาด:
- ตาราง `customers` (ชื่อ เบอร์ อีเมล Line ID)
- ผูก movement → customer
- รายงาน Top Customer, Customer LTV, Reorder reminder

---

### 🟠 B5. ไม่มี Bulk Import (Excel/CSV)

ร้านที่มีสต็อกเดิม 500–2000 รายการในไฟล์ Excel อยู่แล้ว ต้อง add ทีละรายการผ่าน UI → ใช้ไม่ได้จริง

แนะนำ:
- หน้า Import → upload CSV → preview map column → confirm
- รองรับ image URL หรือ Base64 ในแถวเดียวกัน
- Validation: SKU ซ้ำ, ค่าตัวเลขผิด ฯลฯ

---

### 🟠 B6. ไม่มี Barcode / QR Scanner

ร้านต้นไม้ขนาดกลาง-ใหญ่ใช้ป้าย QR/Barcode ติดต้นไม้ — scanner ผ่านมือถือเป็นความต้องการพื้นฐาน

**แก้:** ใช้ `html5-qrcode` หรือ `quagga2` + ปุ่ม scan ในหน้า Stock เพื่อค้น/ปรับสต็อกเร็ว

---

### 🟠 B7. ไม่มี Purchase Order / Restock Workflow

มี `suppliers` table แต่ไม่มี flow:
- สร้าง PO → ส่งให้ supplier → รอรับของ → confirm รับ → ปรับสต็อก
- ติดตามว่า PO ไหนยังไม่มาถึง
- รวมยอดซื้อต่อ supplier ต่อเดือน

ปัจจุบันต้องทำใน LINE / กระดาษ แล้วมาบันทึกเข้าระบบเอง

---

### 🟠 B8. ไม่มี Multi-warehouse / Multi-location

`stock` เป็นตัวเลขเดียวต่อ plant — สมมุติว่าทุกต้นอยู่ที่เดียว

ร้านที่มี:
- หน้าร้าน + โกดัง + สวนเพาะ
- หรือมีหลายสาขา

จะไม่สามารถแยกว่าสาขาไหนเหลือเท่าไร

**แก้ในอนาคต:** ตาราง `locations` + `plant_stocks(plant_id, location_id, qty)`

---

### 🟠 B9. ไม่มี Batch / Lot tracking

ต้นไม้เป็นสินค้าที่ "ต้นเดียวกันรุ่นต่างกัน ราคา/อายุ/คุณภาพต่างกัน" — เช่นกุหลาบรุ่นเดือนมีนาคม vs เดือนพฤษภาคม

ฟีเจอร์ที่ขาด:
- Lot/batch number ในการรับสต็อก
- FIFO หรือ LIFO ในการตัดสต็อก
- รายงานอายุสต็อก (Aged inventory)

---

### 🟠 B10. ไม่มีการแปลงสกุลเงิน (Currency Conversion)

`CurrencyContext` เปลี่ยนสัญลักษณ์ ฿/₭ ได้ แต่ **ราคาตัวเลขเดิมไม่ถูกแปลง** → ราคา 100 บาท จะกลายเป็น "100 ₭" (ที่ความจริงคือ ~74,500 LAK)

**แก้:** อย่างน้อยต้องมี exchange rate table หรือดึงจาก API + เก็บราคาเป็น base currency แล้วแปลงตอนแสดง

---

### 🟡 B11. ไม่มี Promotion / Discount

ขายต้นไม้ที่ราคาส่วนลด, แถม, ราคาขายส่ง — ระบบรองรับแค่ราคาขายตายตัว

---

### 🟡 B12. ไม่มี Loyalty / Membership

ลูกค้าซื้อบ่อย → คะแนนสะสม → ส่วนลด — แทบทุกร้านค้าปลีกใช้

---

### 🟡 B13. ไม่มี Stock Adjustment Approval Flow

Staff role สามารถปรับสต็อกได้ทันที (in/out/adjust) ไม่ต้องขออนุมัติ → เสี่ยงต่อการทุจริต (เช่น staff ขายของแล้วบันทึก "ปรับสต็อก −5 = ของหาย")

**แก้:**
- ปรับสต็อกที่ |qty| > threshold ต้องขออนุมัติจาก owner/admin
- มี audit log แสดงผู้ขออนุมัติ + ผู้อนุมัติ

---

### 🟡 B14. ไม่มี Audit Log สำหรับ Admin

Admin แก้ role หรือลบ user → ไม่มีบันทึกว่าใครทำเมื่อไร → ถ้ามีปัญหาภายในไม่สามารถสืบสวนได้

**แก้:** ตาราง `admin_audit_log(actor_id, action, target_id, payload jsonb, at)` + insert จาก Edge Function

---

### 🟡 B15. ไม่มี Plant Care Schedule

ต้นไม้ต้องการ:
- รดน้ำตามรอบ
- ใส่ปุ๋ยตามรอบ
- เปลี่ยนกระถาง / แต่งกิ่ง

Calendar รองรับ event ทั่วไป แต่ไม่ผูกกับ plant_id หรือ recurring schedule

---

### 🟡 B16. ไม่มี Lao language UI

รองรับสกุลเงิน ₭ (กีบ) แต่ UI ทั้งหมดเป็นไทย — ถ้าเป้าหมายลูกค้าเป็นร้านในลาว ต้อง localization (i18n) ถึง 2 ภาษาเป็นอย่างต่ำ

แนะนำ `react-i18next` หรือ `lingui`

---

### 🟡 B17. ไม่มี Landing Page / Marketing Site

หน้า login เปิดมาเข้าไปที่ app เลย — ไม่มี:
- หน้าโฆษณา / features
- pricing page
- demo video / screenshot
- เคส customer ใช้งาน
- Contact form

ผลกระทบ: ขายโครงการให้คนใหม่ยาก ต้องอธิบายปากเปล่าทุกครั้ง

---

### 🟡 B18. ไม่มี Onboarding Sample Data

ผู้ใช้ใหม่ login เสร็จ → เห็นหน้าจอว่างเปล่า → ไม่รู้ว่าเริ่มจากไหน

แนะนำ:
- "เริ่มต้นด้วยข้อมูลตัวอย่าง 10 ต้น" ใน OnboardingWizard
- หรือมี seed script ที่ admin กดให้ user คนใหม่ได้

---

### 🟢 B19. ไม่มี Mobile App / React Native

PWA ใช้แทนได้ระดับหนึ่งแต่:
- ไม่มี push notification บน iOS Safari
- Camera scanner ใน PWA บนมือถือไม่เสถียร
- ผู้ใช้ไทย/ลาว expect แอป store

ทางออกระยะกลาง: Capacitor wrap → submit ไป Play Store/App Store

---

### 🟢 B20. ไม่มี Integration กับ LINE OA / Facebook Page

ร้านต้นไม้ไทยส่วนใหญ่ขายผ่าน LINE/Facebook — ถ้าระบบรับ webhook จาก LINE OA แล้วบันทึก lead/order ได้ จะมีคุณค่ามาก

---

### 🟢 B21. ไม่มี Image Gallery / ภาพหลายมุม

`plants.image_url` เก็บแค่ภาพเดียว — ลูกค้าอยากเห็นต้น/ใบ/ดอก/ราก หลายมุม

---

### 🟢 B22. ไม่มี Plant Knowledge Base (Wiki)

ฟีเจอร์เพิ่มมูลค่า: เก็บความรู้เรื่อง species, การดูแล, โรค → ผูกกับ plant ในระบบ → กลายเป็น "stock + knowledge base" platform

---

## ส่วนที่ 3 — Production Infrastructure ที่ขาด

### 🔴 I1. ไม่มี Custom Domain

`teang459.github.io/chanthasy-stock` — ไม่ professional + ยากต่อการแชร์/พิมพ์ลงนามบัตร

**แก้:** ซื้อ `.com` หรือ `.co.th` (~500–1500 บาท/ปี) → ตั้ง CNAME ไป GitHub Pages หรือย้าย hosting

---

### 🟠 I2. ไม่มี Error Monitoring

ไม่รู้เลยว่า user คนไหนเจอ error อะไรจนกว่าจะรายงาน → ปัญหาเงียบสะสม

**แก้:** Sentry (ฟรี 5K events/เดือน) → ติดตั้งใน `main.jsx`:
```jsx
Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env.MODE })
```

---

### 🟠 I3. ไม่มี Backup / Restore Drill

Supabase Free plan มี daily backup 7 วัน — แต่:
- ไม่เคย restore จริงเพื่อทดสอบ
- ถ้าผู้ใช้ลบข้อมูลตัวเองโดยไม่ตั้งใจ → ต้อง upgrade Pro ($25/เดือน) ถึงจะ restore ได้

**แก้:** อย่างน้อย script export DB ทุก table ลง R2/S3 รายสัปดาห์ + manual restore drill ไตรมาสละครั้ง

---

### 🟠 I4. ไม่มี Staging / Preview Environment

Push ไป master → production ทันที — ไม่มีที่ทดสอบก่อน

**แก้:** ย้ายไป Vercel → preview deploy ทุก PR ฟรี → merge เข้า main = production

---

### 🟡 I5. ไม่มี Status Page

ผู้ใช้เจอ error → ไม่รู้ว่าระบบล่มหรือเฉพาะตัวเอง

**แก้:** ใช้ statuspage.io, betterstack, หรือสร้าง mini status page เอง (ping Supabase health endpoint)

---

### 🟡 I6. ไม่มี Cookie Consent / PDPA Banner

ถ้าใช้ Sentry/PostHog หรือ analytics ตัวอื่น → ต้องมี banner ขอความยินยอม PDPA

---

## ส่วนที่ 4 — Roadmap แนะนำ

### Phase 1 — Patch Critical (1–2 สัปดาห์)

- [ ] C1: ปิดช่องโหว่ `adjust_stock` (security)
- [ ] C2: update `schema.sql` ให้ตรง production
- [ ] C3: ลบ dead code root (`app.jsx`, etc.)
- [ ] C4: ใช้ dynamic redirect URL
- [ ] C5: ซื้อ domain + verify Resend
- [ ] I1: Custom domain
- [ ] I2: Sentry

### Phase 2 — Polish & Stability (1 สัปดาห์)

- [ ] H1: Topbar search Enter-to-submit
- [ ] H2-H7: bug fixes
- [ ] M4: CI lint + test job
- [ ] I3: Backup drill

### Phase 3 — เริ่มทำธุรกิจ (2–4 สัปดาห์)

- [ ] B3: Invoice / Receipt PDF
- [ ] B2: VAT support
- [ ] B5: Bulk Import
- [ ] B6: Barcode scanner
- [ ] B17: Landing page

### Phase 4 — Scale (1–2 เดือน)

- [ ] B1: Subscription billing
- [ ] B4: Customer database
- [ ] B7: PO workflow
- [ ] B13: Approval flow + audit log
- [ ] M2: TypeScript migration
- [ ] M6: ย้ายไป Vercel + BrowserRouter

### Phase 5 — Expansion

- [ ] B8: Multi-warehouse
- [ ] B9: Batch/Lot tracking
- [ ] B16: i18n (TH/LAO/EN)
- [ ] B19: Mobile app
- [ ] B20: LINE OA integration

---

## ภาคผนวก — สรุปไฟล์/ตำแหน่งสำคัญที่ต้องแก้

| Priority | ไฟล์ | บรรทัด | ปัญหา |
|---|---|---|---|
| 🔴 C1 | `supabase/schema.sql` | 220-241 | `adjust_stock` ไม่ check tenant/role |
| 🔴 C2 | `supabase/schema.sql` | ทั้งไฟล์ | ไม่ตรงกับ migrations ปัจจุบัน |
| 🔴 C3 | `app.jsx`, `data.jsx`, `parts.jsx`, `tweaks-panel.jsx`, `icons.jsx`, `styles.css` | — | Dead code |
| 🔴 C4 | `src/pages/LoginPage.jsx` | 44 | Hard-coded URL |
| 🔴 C5 | `supabase/functions/auth-email-hook/index.ts` | 63 | Resend default sender |
| 🟠 H1 | `src/layout/Topbar.jsx` | 55-59 | Search trigger nav ทุก keystroke |
| 🟠 H2 | `src/pages/MovementsPage.jsx` | 28 | Realtime INSERT only |
| 🟠 H3 | `src/pages/ReportsPage.jsx` | 45 | limit 5000 ตายตัว |
| 🟠 H4 | `src/pages/AdminPage.jsx` | 66 | `name: undefined` |
| 🟠 H5 | `src/pages/StockPage.jsx` | 129, 141, 186 | Silent storage cleanup |
| 🟠 H6 | `src/components/OnboardingWizard.jsx` | 16-23 | ไม่ handle error |

---

**สรุป:** โครงการมีฐานที่ดีและความก้าวหน้าจาก PRODUCTION_PLAN ครั้งก่อนน่าประทับใจ — แต่ก่อนเปิดผู้ใช้จริง ควรปิด **C1 (RPC security hole)** เป็นอันดับแรก จากนั้นจึงค่อยขยับไปงาน Business เพื่อสร้างมูลค่าเชิงพาณิชย์
