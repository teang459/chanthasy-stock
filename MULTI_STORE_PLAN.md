# Multi-Store Architecture Plan

**โครงการ:** Chanthasy Stock — ขยายเป็นระบบจัดการหลายสาขา
**วันที่:** 2026-05-25
**สถานะ:** Draft (ยังไม่เริ่ม implement)
**ขอบเขต:** Schema + RBAC + Daily Settlement

---

## 0. สรุปย่อ (TL;DR)

ตอนนี้โมเดลเป็น **single-owner-per-shop** — "ร้าน" = profile.owner ของ user คนเดียว, staff ผูกกับ owner ผ่าน `manager_id`. ปัญหาคือ:

1. **ร้านไม่ใช่ entity** — ไม่มีตาราง `stores` แยก ทำให้:
   - Super Admin จะสร้างสาขาใหม่ต้องผ่านการสร้าง auth user → profile → backfill
   - ไม่มี store metadata (ที่อยู่, สาขา, รหัสสาขา) นอกจาก `shop_name` ใน profile
2. **Permission หยาบเกินไป** — staff/viewer ได้สิทธิ์ทั้งก้อน แก้แยกตามขอบเขตงานไม่ได้
3. **ไม่มีระบบปิดยอด** — สรุปยอดรายวันต้องไปอ่าน movements + finance_entries เอง ไม่มี snapshot ที่ lock ได้

แผนนี้เสนอ:

- เพิ่มตาราง `stores`, `store_members`, `daily_settlements`
- เปลี่ยน RLS จาก `owner_id` → `store_id` (รักษา compatibility ผ่าน view ระยะเปลี่ยนผ่าน)
- เพิ่ม role tier ใหม่: `super_admin` (global), `store_admin` (per store), `staff` (with perm flags), `viewer`
- ใช้งานได้ทันทีโดยไม่ break ผู้ใช้เดิม (migration backfill อัตโนมัติ)

**สเกลข้อมูลปัจจุบัน:** 4 profiles, 4 owners, 1 super-admin, 5 plants, 16 movements — migration risk ต่ำ

---

## 1. โมเดลปัจจุบัน vs เป้าหมาย

### ปัจจุบัน

```
auth.users ──┐
             ▼
        profiles
        ├── manager_id NULL  → "owner" (เป็นร้าน 1 ร้าน, sole admin)
        └── manager_id SET   → "staff" (ผูกกับ owner)

plants/movements/categories/suppliers/calendar_events/finance_entries
  └── owner_id → auth.users.id   (เสมอเป็น manager_id ของ staff หรือ id ของ owner)

RLS: owner_id = effective_owner_id()
Helper:
  - effective_owner_id() = COALESCE(manager_id, id)
  - is_admin()           = role='admin' AND manager_id IS NULL   (global super)
  - can_write()          = manager_id IS NULL OR role IN ('admin','staff')
  - can_delete()         = manager_id IS NULL OR role='admin'
```

### เป้าหมาย

```
auth.users ──┐
             ▼
        profiles                                stores
        ├── role: super_admin / member          ├── id, code, name, address, tax_id...
        │                                        ├── vat_rate, vat_inclusive, currency
        ▼                                        └── active
   store_members (n:n)  ─────────────────────────▶  store_id
        ├── role: store_admin / staff / viewer
        ├── perm_sell, perm_receive, perm_adjust...
        └── perm_settle (close day)

plants/movements/categories/suppliers/calendar_events/finance_entries
  └── store_id → stores.id

daily_settlements
  ├── store_id, business_date (UNIQUE)
  ├── opened_by/closed_by, opening_cash/closing_cash
  ├── total_sales, total_vat, total_income, total_expense, net
  └── status: open / closed / reopened
```

ความเปลี่ยนแปลงเชิงโมเดล:

| ก่อน | หลัง |
|---|---|
| 1 user = 1 ร้าน | n users ทำงานใน n ร้าน (membership ตาราง) |
| สิทธิ์ผูกกับ role 3 ระดับ | สิทธิ์ผูกกับ membership.role + perm flags |
| Super Admin = `is_admin()` (implicit) | `profiles.role = 'super_admin'` (explicit) |
| ไม่มีปิดยอดวัน | `daily_settlements` lock business_date |

---

## 2. Roles & Permission Matrix

### Tier 1: Super Admin (ตลอดทั้งระบบ)

- `profiles.role = 'super_admin'` (column ใหม่ — แทนค่าเก่า `'admin' AND manager_id IS NULL`)
- เข้าทุกสาขา bypass RLS ผ่าน `is_super_admin()`
- สร้าง/ลบ store, ย้าย user ระหว่าง store, override settlement
- มีปุ่ม "View as store" (เก็บ `adminViewingStoreId` ใน context เดิม)

### Tier 2: Store Admin (ระดับสาขา)

- `store_members.role = 'store_admin'`
- เข้าได้เฉพาะสาขาที่ตัวเองเป็นสมาชิก
- จัดการ plants/categories/suppliers ของสาขา
- เพิ่ม/ลบ staff ในสาขา + กำหนด permission flags
- ปิดยอดวันได้

### Tier 3: Staff (จำกัดตาม perm flags)

- `store_members.role = 'staff'`
- เห็นเฉพาะข้อมูลของสาขาที่เป็นสมาชิก
- Permission flags (แต่ละอันเป็น BOOLEAN ในแถว `store_members`):

| Flag | ความหมาย | Default |
|---|---|---|
| `perm_sell` | ขายของ (insert movement type='out') | true |
| `perm_receive` | รับเข้า (movement type='in') | true |
| `perm_adjust` | ปรับสต็อก (movement type='adjust') | false |
| `perm_manage_plants` | เพิ่ม/แก้/ลบ plants | false |
| `perm_view_reports` | เปิดหน้า Reports | false |
| `perm_finance` | บันทึก finance_entries | false |
| `perm_settle` | ปิดยอดประจำวัน | false |

### Tier 4: Viewer (read-only)

- `store_members.role = 'viewer'`
- เห็นเฉพาะ SELECT, perm flags ถูกบังคับเป็น false ทั้งหมด

### Permission Matrix สรุป

| Action | Super Admin | Store Admin | Staff (default) | Viewer |
|---|---|---|---|---|
| สร้าง store | ✅ | ❌ | ❌ | ❌ |
| ลบ store | ✅ | ❌ | ❌ | ❌ |
| เพิ่ม member ในสาขา | ✅ | ✅ (สาขาตัวเอง) | ❌ | ❌ |
| แก้ store settings (VAT, ที่อยู่) | ✅ | ✅ | ❌ | ❌ |
| Plants CRUD | ✅ | ✅ | ตาม `perm_manage_plants` | ❌ |
| ขาย (out) | ✅ | ✅ | ตาม `perm_sell` | ❌ |
| รับเข้า (in) | ✅ | ✅ | ตาม `perm_receive` | ❌ |
| ปรับสต็อก (adjust) | ✅ | ✅ | ตาม `perm_adjust` | ❌ |
| Reports | ✅ | ✅ | ตาม `perm_view_reports` | ✅ (view) |
| Finance entries | ✅ | ✅ | ตาม `perm_finance` | ❌ |
| ปิดยอดวัน | ✅ | ✅ | ตาม `perm_settle` | ❌ |
| ดูข้ามสาขา | ✅ | ❌ | ❌ | ❌ |

---

## 3. Database Schema Changes

### 3.1 ตารางใหม่

```sql
-- ============================================
-- stores
-- ============================================
CREATE TABLE stores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,           -- เช่น BKK01, CNX02
  name          TEXT NOT NULL,                  -- ชื่อสาขา
  address       TEXT,
  phone         TEXT,
  tax_id        TEXT,                           -- เลขผู้เสียภาษีของสาขา
  vat_rate      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (vat_rate BETWEEN 0 AND 100),
  vat_inclusive BOOLEAN      NOT NULL DEFAULT true,
  currency      TEXT         NOT NULL DEFAULT 'THB' CHECK (currency IN ('THB','LAK')),
  active        BOOLEAN      NOT NULL DEFAULT true,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- store_members (membership + per-store role + perm flags)
-- ============================================
CREATE TABLE store_members (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID NOT NULL REFERENCES stores(id)     ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role               TEXT NOT NULL CHECK (role IN ('store_admin','staff','viewer')),
  perm_sell          BOOLEAN NOT NULL DEFAULT true,
  perm_receive       BOOLEAN NOT NULL DEFAULT true,
  perm_adjust        BOOLEAN NOT NULL DEFAULT false,
  perm_manage_plants BOOLEAN NOT NULL DEFAULT false,
  perm_view_reports  BOOLEAN NOT NULL DEFAULT false,
  perm_finance       BOOLEAN NOT NULL DEFAULT false,
  perm_settle        BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, user_id)
);
CREATE INDEX store_members_user_idx ON store_members(user_id);

-- ============================================
-- daily_settlements
-- ============================================
CREATE TABLE daily_settlements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opening_cash  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  closed_at     TIMESTAMPTZ,
  closed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closing_cash  NUMERIC(12,2),
  -- snapshots (filled when closed)
  total_sales   NUMERIC(12,2),
  total_vat     NUMERIC(12,2),
  total_cost    NUMERIC(12,2),
  total_income  NUMERIC(12,2),
  total_expense NUMERIC(12,2),
  net_sales     NUMERIC(12,2),
  expected_cash NUMERIC(12,2),
  difference    NUMERIC(12,2),
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','reopened')),
  UNIQUE(store_id, business_date)
);
CREATE INDEX daily_settlements_store_date_idx ON daily_settlements(store_id, business_date DESC);
```

### 3.2 ตารางเดิม — เพิ่ม `store_id`

```sql
ALTER TABLE plants          ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE movements       ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE categories      ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE suppliers       ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE calendar_events ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE finance_entries ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

-- เพิ่ม payment_method ใน movements เพื่อแยก cash/transfer/credit
ALTER TABLE movements ADD COLUMN payment_method TEXT
  CHECK (payment_method IN ('cash','transfer','credit','other'));

-- ลิงก์ movement กับ settlement (NULL = ยังไม่ปิดยอด)
ALTER TABLE movements       ADD COLUMN settlement_id UUID REFERENCES daily_settlements(id) ON DELETE SET NULL;
ALTER TABLE finance_entries ADD COLUMN settlement_id UUID REFERENCES daily_settlements(id) ON DELETE SET NULL;
```

### 3.3 ตาราง `profiles` — แก้ role enum

```sql
-- เปลี่ยน CHECK ของ role ให้รวม super_admin (member ใช้สำหรับทุกคนอื่น)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin','member'));

-- backfill: ใครที่เป็น admin + manager_id IS NULL → super_admin, ที่เหลือ = member
UPDATE profiles SET role = 'super_admin'
 WHERE role = 'admin' AND manager_id IS NULL;
UPDATE profiles SET role = 'member' WHERE role <> 'super_admin';
```

หมายเหตุ: `manager_id` ใน profiles ยังเก็บไว้ในระยะเปลี่ยนผ่าน — drop ในเฟส cleanup สุดท้าย

---

## 4. RLS Helpers ใหม่

```sql
-- รายการ store ที่ user มีสิทธิ์เข้า (เป็น UUID[])
CREATE OR REPLACE FUNCTION public.my_store_ids()
RETURNS UUID[] LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(array_agg(store_id), ARRAY[]::UUID[])
  FROM store_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
$$;

CREATE OR REPLACE FUNCTION public.is_store_admin(p_store UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_members
     WHERE user_id = auth.uid() AND store_id = p_store AND role = 'store_admin'
  )
$$;

-- ตรวจ permission flag เฉพาะ store
CREATE OR REPLACE FUNCTION public.has_perm(p_store UUID, p_perm TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v BOOLEAN; BEGIN
  IF is_super_admin() THEN RETURN TRUE; END IF;
  EXECUTE format('SELECT %I FROM store_members WHERE user_id = $1 AND store_id = $2', 'perm_' || p_perm)
    INTO v USING auth.uid(), p_store;
  RETURN COALESCE(v, FALSE);
END $$;
```

### Policy pattern (ใช้กับทุกตารางข้อมูล)

```sql
-- ตัวอย่าง: plants
DROP POLICY IF EXISTS plants_select ON plants;
CREATE POLICY plants_select ON plants FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));

DROP POLICY IF EXISTS plants_insert ON plants;
CREATE POLICY plants_insert ON plants FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (store_id = ANY(my_store_ids()) AND has_perm(store_id, 'manage_plants'))
  );

DROP POLICY IF EXISTS plants_update ON plants;
CREATE POLICY plants_update ON plants FOR UPDATE
  USING      (is_super_admin() OR (store_id = ANY(my_store_ids()) AND has_perm(store_id, 'manage_plants')))
  WITH CHECK (is_super_admin() OR (store_id = ANY(my_store_ids()) AND has_perm(store_id, 'manage_plants')));

DROP POLICY IF EXISTS plants_delete ON plants;
CREATE POLICY plants_delete ON plants FOR DELETE
  USING (is_super_admin() OR is_store_admin(store_id));
```

ตาราง `movements` แตกต่างเล็กน้อย — ต้องเช็คตาม `type`:

```sql
CREATE POLICY movements_insert ON movements FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      store_id = ANY(my_store_ids())
      AND CASE type
            WHEN 'out'    THEN has_perm(store_id, 'sell')
            WHEN 'in'     THEN has_perm(store_id, 'receive')
            WHEN 'adjust' THEN has_perm(store_id, 'adjust')
            ELSE has_perm(store_id, 'manage_plants')
          END
    )
  );
```

RPC `adjust_stock` ต้องอัปเดตให้รับ store_id และตรวจ `has_perm(p_store, p_type)` ตามชนิด

---

## 5. Daily Settlement System

### 5.1 ขั้นตอนการทำงาน

```
┌─────────────────────────────────────────────────────────────┐
│ เช้า 8:00  Cashier เปิดร้าน                                  │
│   → กดปุ่ม "เปิดยอด" → ระบุ opening_cash                     │
│   → INSERT daily_settlements (status='open', opening_cash)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ ตลอดวัน  บันทึกขาย/รับ/จ่าย                                   │
│   → movement.settlement_id ← การหา open settlement ของ       │
│     store + business_date วันนี้                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ ค่ำ 20:00  Cashier ปิดยอด                                    │
│   → กรอก closing_cash (เงินสดที่นับได้)                       │
│   → RPC settle_day(store_id, business_date, closing_cash)    │
│     1. รวม movements WHERE settlement_id = this              │
│     2. รวม finance_entries WHERE settlement_id = this        │
│     3. คำนวณ expected_cash = opening + cash_sales - expense  │
│     4. UPDATE status='closed', set all snapshots              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ พิมพ์ใบสรุปยอดประจำวัน (Z-report)                              │
│   → window.print() เหมือน Invoice                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Lock เมื่อปิดยอด

หลัง close แล้ว — ห้ามแก้ movement/finance ของวันนั้น ยกเว้น super admin:

```sql
CREATE POLICY movements_update ON movements FOR UPDATE
  USING (
    is_super_admin()
    OR (
      store_id = ANY(my_store_ids())
      AND has_perm(store_id, 'adjust')
      AND (settlement_id IS NULL
           OR (SELECT status FROM daily_settlements WHERE id = settlement_id) <> 'closed')
    )
  );
```

Super admin สามารถ "reopen" ได้:

```sql
CREATE OR REPLACE FUNCTION public.reopen_settlement(p_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE daily_settlements
     SET status = 'reopened', note = COALESCE(note,'') || E'\n[reopen] ' || p_reason
   WHERE id = p_id;
END $$;
```

### 5.3 RPC: `open_day` และ `settle_day`

```sql
-- เปิดยอดของวัน (idempotent — ถ้ามี open ของวันนี้แล้ว return id เดิม)
CREATE FUNCTION public.open_day(p_store UUID, p_opening NUMERIC)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; BEGIN
  IF NOT has_perm(p_store, 'settle') THEN
    RAISE EXCEPTION 'Not permitted to settle' USING ERRCODE = '42501';
  END IF;
  INSERT INTO daily_settlements(store_id, business_date, opened_by, opening_cash)
  VALUES (p_store, CURRENT_DATE, auth.uid(), p_opening)
  ON CONFLICT (store_id, business_date) DO UPDATE SET opening_cash = EXCLUDED.opening_cash
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ปิดยอด: คำนวณ snapshots + flip status
CREATE FUNCTION public.settle_day(p_store UUID, p_date DATE, p_closing NUMERIC)
RETURNS daily_settlements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row daily_settlements%ROWTYPE; BEGIN
  IF NOT has_perm(p_store, 'settle') THEN
    RAISE EXCEPTION 'Not permitted to settle' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM daily_settlements
   WHERE store_id = p_store AND business_date = p_date FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open day'; END IF;
  IF v_row.status = 'closed' THEN RAISE EXCEPTION 'Already closed'; END IF;

  WITH m AS (
    SELECT
      SUM(CASE WHEN type='out' THEN ABS(qty) * COALESCE(p.price,0) ELSE 0 END) AS sales,
      SUM(CASE WHEN type='out' AND payment_method='cash' THEN ABS(qty) * COALESCE(p.price,0) ELSE 0 END) AS cash_sales,
      SUM(CASE WHEN type='out' THEN ABS(qty) * COALESCE(p.cost,0)  ELSE 0 END) AS cost
    FROM movements mv LEFT JOIN plants p ON p.id = mv.plant_id
    WHERE mv.settlement_id = v_row.id
  ),
  f AS (
    SELECT
      SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
      SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
    FROM finance_entries WHERE settlement_id = v_row.id
  )
  UPDATE daily_settlements ds SET
    closed_at     = NOW(),
    closed_by     = auth.uid(),
    closing_cash  = p_closing,
    total_sales   = m.sales,
    total_cost    = m.cost,
    total_income  = f.income,
    total_expense = f.expense,
    net_sales     = COALESCE(m.sales,0) - COALESCE(m.cost,0) + COALESCE(f.income,0) - COALESCE(f.expense,0),
    expected_cash = v_row.opening_cash + COALESCE(m.cash_sales,0) + COALESCE(f.income,0) - COALESCE(f.expense,0),
    difference    = p_closing - (v_row.opening_cash + COALESCE(m.cash_sales,0) + COALESCE(f.income,0) - COALESCE(f.expense,0)),
    status        = 'closed'
  FROM m, f WHERE ds.id = v_row.id RETURNING ds.* INTO v_row;
  RETURN v_row;
END $$;
```

หมายเหตุ: `total_vat` ต้องคำนวณตาม `stores.vat_rate` + `stores.vat_inclusive` — ตัวอย่างข้างบนข้ามไปก่อน จะใส่ใน implementation จริง

### 5.4 Auto-link `settlement_id`

เมื่อ insert movement/finance — trigger เติม settlement_id อัตโนมัติ:

```sql
CREATE FUNCTION public.attach_settlement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.settlement_id IS NULL THEN
    SELECT id INTO NEW.settlement_id FROM daily_settlements
     WHERE store_id = NEW.store_id
       AND business_date = CURRENT_DATE
       AND status = 'open';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER movements_attach_settlement
  BEFORE INSERT ON movements FOR EACH ROW EXECUTE FUNCTION attach_settlement();
CREATE TRIGGER finance_attach_settlement
  BEFORE INSERT ON finance_entries FOR EACH ROW EXECUTE FUNCTION attach_settlement();
```

---

## 6. Workflow Examples

### 6.1 Super Admin สร้างสาขาใหม่ + แต่งตั้ง Store Admin

```
1. /admin → ปุ่ม "+ เพิ่มสาขา"
   → กรอก code (BKK02), name, address, VAT settings
   → INSERT stores
2. /admin/stores/BKK02 → ปุ่ม "+ เพิ่มสมาชิก"
   → invite by email (Edge Function: admin-manage-users)
   → ถ้า user มีอยู่แล้ว: INSERT store_members(role='store_admin', perm_*=true)
   → ถ้ายังไม่มี: สร้าง auth.user + profile + store_members
```

### 6.2 Store Admin เพิ่ม Staff + กำหนดสิทธิ์

```
1. /settings → "สมาชิกสาขา" (เห็นเฉพาะสาขาที่ตัวเองเป็น admin)
2. กด "+ เพิ่มพนักงาน"
   → กรอก email + password
   → เลือก perm flags ทีละอัน (checkbox grid)
   → save → store_members row
```

### 6.3 Staff ขายของรายวัน

```
1. เช้า: เปิดแอป → ถ้ามี perm_settle และยังไม่มี open day → popup "เปิดยอด"
2. ระหว่างวัน: ใช้ปุ่ม "ขาย" ในหน้า Stock
   → INSERT movement (type='out', payment_method='cash', store_id=current)
   → trigger เติม settlement_id อัตโนมัติ
3. ค่ำ: กด "ปิดยอด"
   → กรอก closing_cash → RPC settle_day
   → แสดงสรุป + ปุ่มพิมพ์ Z-report
```

### 6.4 ดู Reports ของสาขาเดียวหรือทั้งหมด

- Store Admin: ดูแค่สาขาตัวเอง (RLS filter อัตโนมัติ)
- Super Admin: dropdown เลือกสาขาเดียวหรือ "ทุกสาขา"

---

## 7. Migration Plan (เฟส รายละเอียด)

### Phase A — Schema additive (ไม่ break อะไร)

| ขั้น | Migration | ผลกระทบ |
|---|---|---|
| A1 | สร้าง `stores`, `store_members`, `daily_settlements` | none — ตารางใหม่ |
| A2 | เพิ่ม `store_id` (nullable) ในตารางเดิม | none |
| A3 | เพิ่ม helper functions ใหม่ (`my_store_ids`, `is_super_admin`, `has_perm`) | none — ฟังก์ชันใหม่ |

### Phase B — Backfill data

```sql
-- B1: หนึ่ง owner ปัจจุบัน → หนึ่ง store
INSERT INTO stores (id, code, name, vat_rate, vat_inclusive, currency, tax_id, created_by)
SELECT
  p.id,                                         -- ใช้ profile.id เป็น store.id (1:1 mapping)
  COALESCE(UPPER(LEFT(p.shop_name,3)) || '01', 'STR' || SUBSTRING(p.id::text,1,4)),
  COALESCE(p.shop_name, p.name, 'My Store'),
  p.vat_rate, p.vat_inclusive, p.currency, p.tax_id,
  p.id
FROM profiles p WHERE p.manager_id IS NULL;

-- B2: backfill store_id ในตารางข้อมูล
UPDATE plants          SET store_id = owner_id;
UPDATE movements       SET store_id = owner_id;
UPDATE categories      SET store_id = owner_id;
UPDATE suppliers       SET store_id = owner_id;
UPDATE calendar_events SET store_id = owner_id;
UPDATE finance_entries SET store_id = owner_id;

-- B3: backfill store_members
-- owner → store_admin (full perms)
INSERT INTO store_members(store_id, user_id, role,
  perm_sell, perm_receive, perm_adjust, perm_manage_plants,
  perm_view_reports, perm_finance, perm_settle)
SELECT p.id, p.id, 'store_admin', true, true, true, true, true, true, true
FROM profiles p WHERE p.manager_id IS NULL;

-- existing staff → staff with perm_sell/perm_receive (เดิมก็ทำได้)
INSERT INTO store_members(store_id, user_id, role,
  perm_sell, perm_receive, perm_adjust, perm_manage_plants,
  perm_view_reports, perm_finance, perm_settle)
SELECT p.manager_id, p.id, 'staff',
  true, true,
  (p.role = 'admin'),  -- staff with admin = adjust ok
  (p.role = 'admin'),
  (p.role IN ('admin','staff')),
  (p.role = 'admin'),
  false
FROM profiles p WHERE p.manager_id IS NOT NULL;

-- B4: super admins
UPDATE profiles SET role = 'super_admin'
 WHERE manager_id IS NULL AND role = 'admin';
```

### Phase C — Set NOT NULL + activate new RLS

| ขั้น | Migration | ผลกระทบ |
|---|---|---|
| C1 | ALTER TABLE ... ALTER COLUMN store_id SET NOT NULL | ต้อง backfill ครบก่อน |
| C2 | DROP policy เก่า, CREATE policy ใหม่ทั้งหมด | ⚠️ ต้อง deploy frontend ใหม่พร้อมกัน |
| C3 | DROP `effective_owner_id`, `can_write`, `can_delete` | cleanup |
| C4 | DROP COLUMN `owner_id`, `manager_id` | cleanup สุดท้าย |

> **กฏลำดับ:** Phase A+B รันได้ทันที. Phase C ต้อง deploy frontend ที่ใช้ store_id ก่อน — มี window สั้นๆ ที่ทั้งสอง policy ทำงานพร้อมกัน (additive)

### Phase D — Frontend changes

| ส่วน | เปลี่ยน |
|---|---|
| `AuthContext` | `ownerId` → `currentStoreId` + `stores: Store[]`, `perms: {sell, receive, ...}` |
| Sidebar | dropdown เลือกสาขา (ถ้ามีมากกว่า 1) |
| AdminPage | แทนที่ list users ด้วย list stores → drill down เห็น members |
| StockPage | ปุ่ม "ขาย"/"รับเข้า"/"ปรับ" disable ตาม perm flag |
| New: SettlementPage | UI เปิดยอด/ปิดยอด/ดู history |
| New: StoresPage (super admin) | manage stores |

### Phase E — Daily Settlement go-live

| ขั้น | งาน |
|---|---|
| E1 | เพิ่ม `payment_method` ใน UI ขาย (default cash) |
| E2 | เปิด trigger `attach_settlement` |
| E3 | สร้างหน้า Settlement + RPC open_day/settle_day |
| E4 | ใส่ปุ่ม "พิมพ์ Z-report" |
| E5 | RLS lock movements ของวันที่ปิดแล้ว |

---

## 8. UI/Frontend Changes สรุป

### หน้าใหม่

1. **`/stores`** (super admin) — list/create/edit stores
2. **`/stores/:id/members`** (store admin + super) — manage members + perm flags
3. **`/settlement`** — เปิด/ปิดยอด, history, print Z-report

### หน้าที่ต้องเปลี่ยน

| หน้า | เปลี่ยน |
|---|---|
| Layout sidebar | เพิ่ม store switcher (dropdown ขวาบนหรือใต้ logo) |
| StockPage | ปุ่มขาย/รับ disable ตาม perm + เพิ่ม payment_method dropdown |
| AdminPage | เปลี่ยนจาก "list shops" เป็น "list stores"; เพิ่ม "View as" |
| SettingsPage | ย้าย tax_id/vat_rate/vat_inclusive จาก profiles → stores; แสดงตาม current store |
| Reports | filter dropdown ของสาขา (super admin); ปกติของ store admin = สาขาตัวเอง |
| Invoice | ดึง shop info จาก `stores` แทน `profiles` |
| FinancePage | บันทึก finance_entries.store_id |

### Context shape ใหม่ (`AuthContext`)

```js
{
  user,
  profile: { id, name, role: 'super_admin' | 'member' },
  stores: [{ id, code, name, role, perms: {...} }, ...],
  currentStoreId,
  setCurrentStoreId,
  perms,                  // ของ current store
  isSuperAdmin,
}
```

---

## 9. Risks & Rollback

| ความเสี่ยง | บรรเทา |
|---|---|
| Backfill ผิด → ข้อมูล tenant รั่ว | ทำใน transaction; verify จำนวน rows ตรง before/after |
| Trigger `attach_settlement` ลืมเปิด → settlement_id NULL | settle_day fallback ดึงตามวันที่ก็ได้ |
| User งงเรื่อง store switcher | ถ้ามี 1 store ซ่อน dropdown |
| Settlement ผูกผิดวัน (timezone) | ใช้ `CURRENT_DATE` ของเซิร์ฟเวอร์ + แสดง timezone ใน UI |
| Phase C deploy frontend ไม่ตรงกับ DB | ทำ feature flag: ตรวจ existence ของ `store_id` ก่อน query |

**Rollback plan:** ทุก migration เขียนคู่ `up`/`down` หรืออย่างน้อย document undo SQL. Phase A+B ไม่ต้อง rollback เพราะ additive. Phase C ถอย: re-enable policy เก่าก่อน drop column

---

## 10. Decisions (answered 2026-05-25)

### Q1 — Code structure: incremental หรือ big-bang branch?

**ตอบ: Incremental commits, ทีละ phase**

- เหตุผล: ข้อมูล production ตอนนี้เล็กมาก (4 owners, 16 movements) → risk ต่อ phase ต่ำ. CI gate (lint/test/build) จับ regression ได้ทันที. Phase A+B เป็น additive — รัน production ได้เลยโดยไม่ต้องรอ frontend
- วิธี: commit/PR แยกต่อ migration (006, 007, 008, 009) + frontend ขั้นต่อขั้น
- ถ้า Phase C cutover ผิด → ยังมี policy เก่าทำงานคู่ขนาน (additive) ก่อน DROP

### Q2 — Payment methods ใส่กี่แบบ?

**ตอบ: ใส่ทั้ง 4 ตั้งแต่แรก — `cash`, `transfer`, `credit`, `other`**

- เหตุผล: cost = CHECK constraint ยาวขึ้น 2 ตัว, dropdown UI เพิ่ม 2 option. settlement diff ต้องการแค่ "cash vs ไม่ cash" — แต่การมี credit/other ตั้งแต่แรกทำให้ report (เช่น "ยอดขายค้างชำระ" = credit) ใช้ได้ทันทีโดยไม่ต้อง migrate ภายหลัง
- Default = `cash` (movement ที่ insert จาก legacy code โดยไม่กรอก)

### Q3 — Currency per store

**ตอบ: ใช้ของ store** (ตามที่ plan เสนอ)

- `stores.currency` เป็น single source of truth
- `profiles.currency` กลายเป็น user preference สำหรับการแสดงผลเท่านั้น (เช่น ผู้ใช้ลาวอยากเห็น LAK บน UI แม้ store เป็น THB) — Phase C cleanup จะลบทิ้งถ้าไม่จำเป็น

### Q4 — Tax invoice numbering หลัง migrate

**ตอบ: OK — 1:1 backfill ทำให้เลขเดิมไม่เปลี่ยน**

- ปัจจุบัน: `INV-YYYYMMDD-NNNN` จาก count of `out` movements WHERE owner_id = X
- หลัง backfill: store.id = owner.id (1:1) → count of `out` movements WHERE store_id = X ได้ค่าเหมือนเดิม
- **Edge case (document ไว้):** ถ้าอนาคต super admin "merge" หรือ "split" stores จะ renumber. v1 ไม่มี feature นี้ — เพิ่มทีหลังพร้อม migration เลข

### Q5 — Settlement timezone

**ตอบ: hardcode `Asia/Bangkok` (UTC+7) ใน v1**

- เหตุผล: THB และ LAK ทั้งคู่อยู่ UTC+7 (Bangkok = Vientiane). zero use case ตอนนี้
- Implementation: ใน `open_day` RPC ใช้ `(NOW() AT TIME ZONE 'Asia/Bangkok')::date` แทน `CURRENT_DATE` ดิบ
- เปิด `stores.timezone TEXT DEFAULT 'Asia/Bangkok'` ในตารางไว้แต่ยังไม่ใช้ — ลด cost migration อนาคต

### Q6 — Reopen settlement audit

**ตอบ: append ลง `daily_settlements.note` ใน v1 พอ**

- เหตุผล: ทุกการ reopen เก็บ "[reopen 2026-XX-XX by uid] reason" ใน text column. ไม่ต้องตารางใหม่
- Tradeoff: query audit ลำบาก แต่ v1 ไม่ต้องการ compliance level — เพิ่มตาราง `settlement_audit` เมื่อมีลูกค้าที่ต้องการ จริงๆ
- เพิ่ม audit ตารางใหม่ในอนาคตเป็น additive migration ไม่ break อะไร

### Q7 — Tax fields ย้าย profile → store

**ตอบ: ย้ายไปอยู่ที่ store**

- เหตุผล: tax_id, vat_rate, vat_inclusive เป็นข้อมูลของ "ร้าน" ไม่ใช่ "คน" — ใบกำกับภาษีออกในนามร้าน. ถ้า super admin มี 5 ร้าน ก็มี tax_id 5 เลข
- Migration B1 จะ copy ค่าจาก profile → store ตอน backfill (1:1) — ใบเสร็จเดิมไม่กระทบ
- Phase C cleanup: ลบ `profiles.tax_id`, `profiles.vat_rate`, `profiles.vat_inclusive` (โค้ดที่ใช้อ้างอิงต้อง refactor)

### Q8 (เพิ่ม) — Stock per-plant vs per-store

**ตอบ: Option A — one plant row per (store, sku)** ใน v1; multi-warehouse (B8) เป็นเรื่องของ Phase 5

- เหตุผล:
  1. Backfill 1:1 — plants เดิมทุกแถวมี owner_id → store_id ตรงๆ ไม่ต้องแตกแถว
  2. ร้าน 2 สาขาขายต้นไม้ชื่อเดียวกัน = 2 plants คนละแถว (SKU code อาจซ้ำคนละ store ได้ — UNIQUE จะเป็น `(store_id, sku)`)
  3. Multi-warehouse จริง (Phase 5) คือ plant เดียว แต่ stock แยกตาม location — ใช้ตาราง `plant_stocks(plant_id, location_id, qty)` แยกออกมา ไม่ conflict
- เปลี่ยน UNIQUE INDEX:
  - `plants_sku_per_owner` → `plants_sku_per_store` ON `plants(store_id, sku)`
  - เช่นเดียวกับ `categories_code_per_store`, `suppliers_code_per_store`

---

## 11. Implementation Order (เสนอ)

ถ้าตัดสินใจไปต่อ:

1. ✅ Plan นี้ (commit เป็น MULTI_STORE_PLAN.md ก่อน) ← จุดที่อยู่
2. Migration `006_stores_phase_a.sql` (สร้างตาราง + helpers)
3. Migration `007_stores_phase_b_backfill.sql` (backfill)
4. Frontend: AuthContext + store switcher + permission gates
5. Migration `008_stores_phase_c_cutover.sql` (NOT NULL + new RLS + drop old)
6. Migration `009_daily_settlement.sql` (settlement table + triggers + RPCs)
7. Frontend: SettlementPage + payment_method + lock UI
8. Frontend: StoresPage + StoreMembersPage (super admin/store admin)
9. Z-report PDF + history

แต่ละขั้น = commit แยก + CI gate + apply migration บน production ผ่าน Management API

---

**สถานะ:** Decisions ครบแล้ว (Section 10). พร้อมเริ่ม Step 2 — migration `006_stores_phase_a.sql`
