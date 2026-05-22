# แผนการแก้ไขเพื่อนำขึ้นใช้งานจริง (Production Plan)

**โครงการ:** Chanthasy Stock — ระบบจัดการสต็อกต้นไม้
**Stack:** React 18 + Vite + Supabase + GitHub Pages
**วันที่ตรวจสอบ:** 2026-05-22
**สถานะ:** ใช้งานได้ภายในแต่ยังมีจุดต้องปรับก่อนรับผู้ใช้จริงในวงกว้าง

---

## สรุประดับความสำคัญ

| ระดับ | จำนวน | คำอธิบาย |
|-------|-------|----------|
| 🔴 Critical | 8 ข้อ | ต้องแก้ก่อนเปิดให้ผู้ใช้จริง (Security, Data integrity) |
| 🟠 High | 10 ข้อ | บั๊กที่กระทบการใช้งานทุกวัน |
| 🟡 Medium | 12 ข้อ | คุณภาพโค้ดและ UX ที่ควรปรับ |
| 🟢 Low | 8 ข้อ | Nice-to-have สำหรับการแข่งขัน/ขยาย |

---

## 🔴 Critical — ต้องแก้ก่อนเปิดใช้จริง

### C1. UNIQUE constraints แบบ global ทำให้รองรับ multi-tenant ไม่ได้

**ปัญหา:** ใน `schema.sql` กำหนด:
```sql
plants.sku        TEXT NOT NULL UNIQUE       -- บรรทัด 39
categories.code   TEXT NOT NULL UNIQUE       -- บรรทัด 18
suppliers.code    TEXT NOT NULL UNIQUE       -- บรรทัด 27
```

ผลกระทบ: ถ้าร้าน A ใช้ SKU `PLT001` ร้าน B จะใช้ไม่ได้เลย — ขัดกับโมเดล SaaS

**แก้:**
```sql
ALTER TABLE plants     DROP CONSTRAINT plants_sku_key;
ALTER TABLE categories DROP CONSTRAINT categories_code_key;
ALTER TABLE suppliers  DROP CONSTRAINT suppliers_code_key;

CREATE UNIQUE INDEX plants_sku_per_owner     ON plants(owner_id, sku);
CREATE UNIQUE INDEX categories_code_per_owner ON categories(owner_id, code);
CREATE UNIQUE INDEX suppliers_code_per_owner  ON suppliers(owner_id, code);
```

---

### C2. ไฟล์ `schema.sql` ล้าสมัยมาก ไม่ตรงกับ DB จริง

**ปัญหา:** `supabase/schema.sql` ไม่มีคอลัมน์ที่โปรเจกต์ใช้จริง:
- `owner_id`, `manager_id`, `shop_name`, `image_url`
- `calendar_events.time` เป็น TEXT ทั้งที่ frontend ใช้ `<input type="time">`
- `movements.type` CHECK constraint ขาด `'new'`, `'delete'`, `'rename'`
- ไม่มี `is_admin()` function หรือ admin bypass policies ที่เพิ่งสร้าง
- RLS policies เขียน `USING (true)` ซึ่งอันตรายมาก

**แก้:** เขียน `schema.sql` ใหม่ทั้งไฟล์ให้ตรงกับ DB จริง — ทำให้ใครก็ตามที่ deploy ใหม่ได้สถานะเหมือนของจริง

---

### C3. CalendarPage ใช้ `user.id` ไม่ใช่ `ownerId`

**ปัญหา:** `src/pages/CalendarPage.jsx:97`
```jsx
const payload = { ..., created_by:user?.id, owner_id:user?.id }
```

ผลกระทบ: staff (ที่มี `manager_id`) สร้าง event แล้วจะ owner_id = ตัวเอง ไม่เห็น/ไม่ถูกมองเห็นจากเจ้าของร้าน

**แก้:**
```jsx
const { user, ownerId } = useAuth()
// ...
const payload = { ..., created_by: user?.id, owner_id: ownerId }
```

---

### C4. Real-time subscriptions ไม่กรอง owner_id

**ปัญหา:** ทุกหน้าใช้ `supabase.channel(...).on('postgres_changes', { table:'plants' }, ...)` แบบไม่กรอง

```jsx
// StockPage.jsx, LowStockPage.jsx, DashboardPage.jsx, Layout.jsx
.on('postgres_changes', { event:'*', schema:'public', table:'plants' }, load)
```

ผลกระทบ:
1. ทุก client จะได้รับ event เมื่อ shop อื่นๆ มีการเปลี่ยนแปลง → callback ทำงาน → query ใหม่ → load จะถูกเรียกบ่อยเกินไป สิ้นเปลือง
2. ถ้าใช้ Supabase Realtime แบบ premium จะเสียค่าใช้จ่าย

**แก้:**
```jsx
.on('postgres_changes', {
  event:'*', schema:'public', table:'plants',
  filter: `owner_id=eq.${ownerId}`
}, load)
```

---

### C5. Error messages โชว์ raw `err.message` ให้ผู้ใช้

**ปัญหา:** กระจายอยู่หลายที่:
```jsx
toast.error(`เกิดข้อผิดพลาด: ${err.message}`)         // StockPage:149
toast.error(`บันทึกไม่สำเร็จ: ${error.message}`)      // SettingsPage:62
this.state.error.message                              // ErrorBoundary:21
```

ผลกระทบ:
- ผู้ใช้เห็นข้อความแบบ PostgreSQL error เช่น `relation "xxx" does not exist`
- เปิดเผยข้อมูลโครงสร้าง DB (security risk เล็กน้อย)
- UX แย่ ผู้ใช้ไม่เข้าใจ

**แก้:** สร้าง mapper `lib/errors.js`:
```js
export function userMessage(err) {
  const code = err?.code
  if (code === '23505') return 'ข้อมูลซ้ำกับที่มีอยู่แล้ว'
  if (code === '23503') return 'ข้อมูลถูกอ้างอิงโดยรายการอื่น ไม่สามารถลบได้'
  if (code === '42501') return 'ไม่มีสิทธิ์ดำเนินการ'
  if (code === 'PGRST116') return 'ไม่พบข้อมูล'
  return 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง'
}
```

ใน production แสดง user-friendly message + ส่ง raw error ไป error tracking (Sentry)

---

### C6. ไม่มี server-side enforcement ของ role

**ปัญหา:** บทบาท `viewer` หรือ `staff` ถูกบังคับแค่ใน UI เท่านั้น ใครก็ตามที่รู้วิธีเปิด DevTools แล้วเรียก `supabase.from('plants').delete()` ก็ลบได้

**แก้:** เพิ่ม RLS policies แยกตาม role:
```sql
-- Viewer อ่านอย่างเดียว, ไม่ INSERT/UPDATE/DELETE
CREATE POLICY "viewer_readonly" ON plants FOR SELECT
  TO authenticated
  USING (owner_id = COALESCE((SELECT manager_id FROM profiles WHERE id = auth.uid()), auth.uid()));

CREATE POLICY "writer_only" ON plants FOR INSERT
  USING (
    owner_id = COALESCE((SELECT manager_id FROM profiles WHERE id = auth.uid()), auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','staff')
  );
-- ทำซ้ำสำหรับ UPDATE, DELETE
```

---

### C7. Password strength ต่ำเกินไป

**ปัญหา:** validate แค่ `length >= 6` ใน `SignUpPage`, `SettingsPage`, `ResetPasswordPage` — รับรหัส `123456` ได้

**แก้:** เพิ่มเงื่อนไข:
- อย่างน้อย 8 ตัวอักษร
- มีตัวอักษรและตัวเลขปนกัน
- ไม่อนุญาตรหัสยอดนิยม (`password`, `12345678`, `qwerty`)

หรือเปิด HIBP check ใน Supabase Auth (`password_hibp_enabled: true`)

---

### C8. ไม่มี Domain verification สำหรับอีเมล

**ปัญหา:** ตอนนี้ `mailer_autoconfirm: true` หมายความว่า:
- ใครก็สมัครได้ด้วยอีเมลปลอม (`fake@fake.com`)
- เจ้าของอีเมลจริงไม่รู้ว่ามีคนใช้อีเมลของตัวเองสมัคร
- ไม่มี Forgot Password ใช้ได้จริง (เพราะ Resend ส่งเมลออกไม่ได้)

**แก้:**
1. ซื้อ domain (เช่น `chanthasy.com`)
2. Verify domain ที่ resend.com/domains (ฟรี)
3. แก้ `supabase/functions/auth-email-hook/index.ts` ให้ใช้ `noreply@chanthasy.com`
4. เปิด hook + ปิด `mailer_autoconfirm`

---

## 🟠 High — บั๊กที่กระทบการใช้งานรายวัน

### H1. Currency เก็บใน localStorage เท่านั้น

**ปัญหา:** `CurrencyContext.jsx` เก็บใน `localStorage.cs_currency` — เปลี่ยนเครื่อง/เบราว์เซอร์ → reset

**แก้:** เพิ่มคอลัมน์ `currency` ใน `profiles` แล้ว sync ทั้งสองทาง:
```jsx
function setCurrency(c) {
  supabase.from('profiles').update({ currency: c }).eq('id', user.id)
  setCurrencyState(c)
}
```

---

### H2. Topbar search ล้างข้อความเมื่อ blur

**ปัญหา:** `Topbar.jsx:67` มี `onBlur={() => setQ('')}` — กดออกนอก input ปุ๊บ ข้อความหาย

**แก้:** ลบ `onBlur` ทิ้ง หรือใช้ `setTimeout` ให้รอ navigation เสร็จก่อน

---

### H3. OnboardingWizard แสดงให้ staff ด้วย

**ปัญหา:** `Layout.jsx:19`
```jsx
if (profile && !profile.shop_name && !localStorage.getItem('onboarding_done')) {
  setShowOnboarding(true)
}
```

Staff ที่ผูกกับ owner (มี `manager_id`) ไม่ควรเห็น wizard เพราะไม่ใช่เจ้าของร้าน

**แก้:**
```jsx
if (profile && !profile.manager_id && !profile.shop_name && !localStorage.getItem('onboarding_done')) {
  setShowOnboarding(true)
}
```

---

### H4. ไม่มี Image size limit / compression

**ปัญหา:** `StockPage.jsx:105` `handleImageUpload` อัปโหลดไฟล์ตามขนาดเดิม
- ผู้ใช้อัปรูป 8MB จากมือถือ → กิน Supabase Storage quota
- โหลดหน้าช้า

**แก้:**
```js
if (file.size > 2 * 1024 * 1024) { toast.error('รูปต้องไม่เกิน 2MB'); return }
// หรือใช้ canvas compress รูปก่อน upload
```

---

### H5. ลบรูปออกจาก plants ไม่ลบไฟล์ใน Storage

**ปัญหา:** กดลบรูปแค่ตั้ง `image_url = ''` ใน DB ไฟล์ใน Supabase Storage ยังอยู่
ลบ plant ทั้งรายการก็เหมือนกัน

**แก้:** เพิ่มฟังก์ชัน cleanup:
```js
async function deletePlantImage(url) {
  if (!url) return
  const path = url.split('/plant-images/')[1]
  if (path) await supabase.storage.from('plant-images').remove([path])
}
```

หรือ trigger DB เป็น cron job รายเดือน

---

### H6. DashboardPage ไม่ refetch realtime ถูกต้อง

**ปัญหา:** `DashboardPage.jsx:17` subscribe แค่ table `plants` ไม่ครอบ `movements`
- เพิ่มสต็อกใน StockPage → dashboard refresh
- แต่ดูประวัติแล้วเพิ่มใน MovementsPage → recent movements ไม่อัปเดต

**แก้:** subscribe ทั้งสอง table

---

### H7. ไม่มี Forgot Password page handler บน HashRouter

**ปัญหา:** Supabase ส่งลิงก์ recovery มา → arrived URL = `https://teang459.github.io/chanthasy-stock#access_token=xxx&type=recovery`
- HashRouter พยายาม parse `access_token=xxx&type=recovery` เป็น route → ไม่ match → ไป `/`
- Supabase client detect token from hash → fire `PASSWORD_RECOVERY`
- `RecoveryHandler` (ที่ใส่ไปแล้ว) จะนำทางไป `/reset-password`

**สถานะ:** น่าจะใช้ได้ แต่ต้อง test จริงด้วย email + click link

**แก้:** ถ้าทดสอบแล้วไม่ work เปลี่ยนเป็น BrowserRouter + 404.html redirect trick สำหรับ GitHub Pages

---

### H8. ลบข้อมูลแล้วไม่ confirm rate limit

**ปัญหา:** กด Confirm ลบ plant ระบบไม่บอก "กำลังลบ..." ทำให้กดซ้ำได้ → ส่ง delete หลายครั้ง

**แก้:** disable ปุ่ม Confirm ใน `Confirm.jsx` ระหว่าง async operation

---

### H9. AdminPage edit ใช้ `<select>` แต่ schema check role values

**ปัญหา:** ใน AdminPage ถ้าเพิ่ม role อื่นใน UI โดยไม่อัปเดต DB CHECK constraint → ผิดพลาดเงียบๆ

**แก้:** Migration: เพิ่ม `manager_id` ใน profiles + ตรวจ CHECK constraint ของ role ให้ครบ

---

### H10. AdminPage ไม่แสดง email ของ user

**ปัญหา:** Admin ดูบัญชีอื่นได้แต่ไม่เห็นอีเมลของ user (อยู่ใน `auth.users` ไม่ใช่ `profiles`)

**แก้:** RPC `get_all_shops_for_admin` ควร JOIN กับ `auth.users` เพื่อ return email:
```sql
SELECT p.*, u.email
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE is_admin()
```

---

## 🟡 Medium — คุณภาพโค้ดและ UX

### M1. ลบ `BillingPage.jsx` ออก (dead code)

ไม่ได้ import แล้วแต่ยังอยู่ในโฟลเดอร์ — ลบทิ้งเพื่อความสะอาด

---

### M2. ลบ `tree-stock-enterprise/` folder

**ปัญหา:** มี folder อื่นในโปรเจกต์ (เห็นจาก `tree-stock-enterprise/.env`) ที่ดูเหมือนเป็นโปรเจกต์เก่า

**แก้:** ตรวจสอบและลบทิ้งถ้าไม่ใช้

---

### M3. แยก inline styles ออกจาก JSX

**ปัญหา:** หลายไฟล์ใช้ inline `style={{ ... }}` ทำให้อ่านยาก:
- `BillingPage.jsx`, `AdminPage.jsx`, `Layout.jsx`, `OnboardingWizard.jsx`

**แก้:** ย้ายไป CSS classes ใน `index.css` หรือใช้ CSS modules

---

### M4. ไม่มี TypeScript

ทำให้:
- ตรวจ type ของ Supabase response ไม่ได้
- IDE ไม่ช่วย auto-complete payload shapes
- Refactor เสี่ยง

**แก้:** ค่อยๆ ย้ายไป `.tsx` + `supabase gen types typescript` สร้าง type จาก DB

---

### M5. ไม่มี Linter / Formatter

**แก้:** เพิ่ม:
```json
"devDependencies": {
  "eslint": "^9",
  "eslint-plugin-react": "...",
  "prettier": "^3"
}
```
+ `.eslintrc`, `.prettierrc`

---

### M6. มี duplicate code ระหว่าง pages

**ปัญหา:** Filter/search/pagination logic ของ StockPage, MovementsPage, SuppliersPage ซ้ำกัน

**แก้:** สร้าง custom hook `useFilteredList(items, { search, filter, sort, page })`

---

### M7. ไม่มี loading skeletons

**ปัญหา:** ทุกหน้าใช้ `<Spinner />` ตรงกลางจอ ดู bland

**แก้:** ใส่ skeleton placeholder ตาม layout จริง (เหมือน YouTube/LinkedIn)

---

### M8. ReportsPage ไม่กรอง 2000 movements ตามช่วงเวลา

**ปัญหา:** `limit(2000)` ดึงล่าสุด 2000 รายการเสมอ — ถ้าร้านใหญ่ใช้เกิน 2000/เดือน ข้อมูลเก่าหาย

**แก้:** เพิ่ม date range picker ให้ผู้ใช้เลือกช่วง

---

### M9. ไม่มี Empty state สำหรับ Calendar

ถ้าเดือนนั้นไม่มี event เลย ไม่มี hint บอกว่าให้กดวันที่เพื่อเพิ่ม

---

### M10. Topbar shopname เป็น static

**ปัญหา:** `Topbar.jsx:27` `const shopName = profile?.shop_name?.trim() || 'My Shop'`

ถ้า admin กำลังดูร้านอื่น (admin view mode) topbar ยังโชว์ชื่อร้านของ admin

**แก้:** ดึงชื่อร้านจาก `ownerId` แทน
```jsx
// ใช้ adminViewingName ที่มีอยู่ใน Layout
```

---

### M11. ไม่ได้ใช้ `useMemo` ใน DashboardPage

**ปัญหา:** ทุกๆ render คำนวณ stats ใหม่หมด:
```jsx
const total  = plants.length
const ok     = plants.filter(p => statusOf(p) === 'ok').length
// ... อีก 6 บรรทัด
```

**แก้:** wrap ใน `useMemo([plants])`

---

### M12. Supabase realtime ไม่ unsubscribe ถูกตอน admin switch shop

**ปัญหา:** Layout subscribe channel `'layout-plants'` ตอน mount ถ้า admin switch shop, useEffect rerun + return cleanup แต่ channel name เดิม → อาจจะมี race condition

**แก้:** ใช้ unique channel name ต่อ ownerId:
```jsx
.channel(`layout-plants-${ownerId}`)
```

---

## 🟢 Low — Nice to have

### L1. ไม่มี PWA / Add to Home Screen

**แก้:** เพิ่ม `vite-plugin-pwa`, manifest.json, service worker

---

### L2. ไม่มี Custom Domain

ตอนนี้ใช้ `teang459.github.io/chanthasy-stock` — ดูไม่ professional สำหรับ SaaS

**แก้:** ซื้อ domain → ตั้ง CNAME ไป GitHub Pages หรือย้ายไป Vercel

---

### L3. ไม่มี Error Tracking

**แก้:** เพิ่ม Sentry หรือ PostHog (มี free tier):
```js
import * as Sentry from "@sentry/react"
Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN })
```

---

### L4. ไม่มี Analytics

**แก้:** PostHog (มี free tier 1M events/เดือน) — รู้ว่า feature ไหนใช้บ่อย

---

### L5. ไม่มี 2FA

สำหรับ admin account — เปิด TOTP MFA ใน Supabase

---

### L6. ไม่มี Data Export (PDPA compliance)

PDPA/GDPR: ผู้ใช้มีสิทธิ์ขอ data ของตัวเองออก
**แก้:** ปุ่ม "ดาวน์โหลดข้อมูลทั้งหมด" ใน Settings → ZIP ของ JSON ทุก table

---

### L7. ไม่มี Cookie consent / Cookie banner

ถ้าเปิดใช้ analytics ต้องมี banner ตาม PDPA

---

### L8. ไม่มี Tests

**แก้:** เพิ่ม Vitest + React Testing Library อย่างน้อยทดสอบ:
- Auth flow
- Plant CRUD
- Permission boundaries (staff อ่านได้ ลบไม่ได้)

---

## แผนการดำเนินงาน (Suggested Roadmap)

### Sprint 1 — Security & Data Integrity (1-2 สัปดาห์)
- [ ] C1: แก้ UNIQUE constraints
- [ ] C2: อัปเดต schema.sql ให้ตรงกับ DB จริง
- [ ] C3: CalendarPage ใช้ ownerId
- [ ] C5: User-friendly error mapper
- [ ] C6: Role-based RLS policies
- [ ] C7: Password strength
- [ ] H10: Admin เห็น email ของ user

### Sprint 2 — Polish & Bugs (1 สัปดาห์)
- [ ] H1: Currency sync to DB
- [ ] H2: Topbar search ไม่หาย
- [ ] H3: Onboarding skip for staff
- [ ] H4-H5: Image limits + cleanup
- [ ] H6: Dashboard realtime
- [ ] H7: ทดสอบ password reset link จริง
- [ ] M1: ลบ BillingPage
- [ ] M2: ลบ tree-stock-enterprise folder
- [ ] M10: Topbar shopname follow admin view

### Sprint 3 — Production Infrastructure (1-2 สัปดาห์)
- [ ] C8: Domain verification + Resend
- [ ] L2: Custom domain
- [ ] L3: Sentry error tracking
- [ ] L4: PostHog analytics
- [ ] L1: PWA setup
- [ ] M5: Linter + formatter

### Sprint 4 — Advanced Features (ตามต้องการ)
- [ ] M4: TypeScript migration
- [ ] L5: 2FA
- [ ] L6: Data export
- [ ] L8: Tests
- [ ] M3: CSS refactor
- [ ] M6: Custom hooks

---

## หมายเหตุพิเศษ

### ลบออกได้เลย (Dead Code)
- `src/pages/BillingPage.jsx` — ไม่ได้ import แล้ว
- `tree-stock-enterprise/` folder — โปรเจกต์เก่า ตรวจสอบและลบ
- `supabase/.temp/cli-latest` — ไฟล์ temp ของ CLI

### Database tables ที่อาจไม่ใช้แล้ว
- `team_invites` (สร้างไว้แต่ลบ feature ออก)
- `subscriptions`, `plans` (Billing ลบแล้ว)

ตรวจสอบใน Supabase Dashboard แล้วลบทิ้งถ้าไม่ใช้

### Performance Concerns
- Bundle size 478KB / 134KB gzip — อาจ optimize ด้วย dynamic import (lazy load routes)
- ไม่มี Image CDN — ใช้ Supabase Storage publicUrl ตรงๆ ไม่มี caching

### Backup
- Supabase Free plan: backup รายวัน 7 วัน
- Production ควรอัปเกรด Pro ($25/เดือน) เพื่อ point-in-time recovery

---

**ขั้นตอนถัดไป:** เลือก Sprint 1 มาทำก่อน — ส่วน Critical ทั้ง 8 ข้อจะปิดช่องโหว่หลักๆ ที่ขัดขวางการใช้งานจริง
