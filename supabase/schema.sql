-- ================================================================
-- สวนสมใจ STOCK — Supabase Schema
-- รัน SQL นี้ใน Supabase Dashboard > SQL Editor
-- ================================================================

-- Profiles (เชื่อมกับ auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff','viewer')),
  initials   TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories (หมวดหมู่)
CREATE TABLE IF NOT EXISTS categories (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name_th    TEXT NOT NULL,
  hue        INTEGER NOT NULL DEFAULT 140,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Suppliers (ซัพพลายเออร์)
CREATE TABLE IF NOT EXISTS suppliers (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  contact    TEXT,
  phone      TEXT,
  email      TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plants (ต้นไม้/สินค้า)
CREATE TABLE IF NOT EXISTS plants (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sku         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  name_sci    TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock   INTEGER NOT NULL DEFAULT 5 CHECK (min_stock >= 0),
  price       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost        NUMERIC(10,2) CHECK (cost >= 0),
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Movements (ประวัติเคลื่อนไหวสต็อก)
CREATE TABLE IF NOT EXISTS movements (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plant_id   UUID REFERENCES plants(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('in','out','adjust')),
  qty        INTEGER NOT NULL,
  note       TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar Events (ปฏิทิน)
CREATE TABLE IF NOT EXISTS calendar_events (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title      TEXT NOT NULL,
  date       DATE NOT NULL,
  time       TEXT,
  type       TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('general','delivery','order','reminder','maintenance')),
  note       TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- Row Level Security
-- ================================================================

ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE plants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE movements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events  ENABLE ROW LEVEL SECURITY;

-- ผู้ใช้ที่ login แล้วสามารถ CRUD ข้อมูลทั้งหมดได้
CREATE POLICY "auth_all" ON profiles        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON categories      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON suppliers       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON plants          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON movements       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON calendar_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ================================================================
-- Trigger: สร้าง profile อัตโนมัติเมื่อมีผู้ใช้ใหม่
-- ================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, name, role, initials)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff'),
    COALESCE(NEW.raw_user_meta_data->>'initials', upper(left(split_part(NEW.email,'@',1), 2)))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger: อัปเดต updated_at อัตโนมัติ
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS plants_updated_at ON plants;
CREATE TRIGGER plants_updated_at BEFORE UPDATE ON plants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- Seed Data (ข้อมูลตัวอย่าง)
-- ================================================================

INSERT INTO categories (code, name_th, hue) VALUES
  ('flower',    'ไม้ดอก',     340),
  ('foliage',   'ไม้ใบ',      140),
  ('succulent', 'ไม้อวบน้ำ',   60),
  ('herb',      'สมุนไพร',    170),
  ('tree',      'ไม้ยืนต้น',  100)
ON CONFLICT (code) DO NOTHING;

INSERT INTO suppliers (code, name, contact, phone) VALUES
  ('SUP001', 'สวนป้าแดง',         'คุณแดง',  '081-234-5678'),
  ('SUP002', 'ฟาร์มเขียวขจี',     'คุณเขียว','089-876-5432'),
  ('SUP003', 'บริษัทพืชสวนไทย',   'ฝ่ายขาย', '02-345-6789')
ON CONFLICT (code) DO NOTHING;

-- Plants seed (อ้างอิง category/supplier ด้วย subquery)
INSERT INTO plants (sku, name, name_sci, category_id, supplier_id, stock, min_stock, price, cost)
SELECT 'PLT001','กุหลาบ','Rosa',c.id,s.id,45,10,120,80
  FROM categories c, suppliers s WHERE c.code='flower' AND s.code='SUP001'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO plants (sku, name, name_sci, category_id, supplier_id, stock, min_stock, price, cost)
SELECT 'PLT002','ต้นมอนสเตอร่า','Monstera deliciosa',c.id,s.id,12,5,350,200
  FROM categories c, suppliers s WHERE c.code='foliage' AND s.code='SUP002'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO plants (sku, name, name_sci, category_id, supplier_id, stock, min_stock, price, cost)
SELECT 'PLT003','กระบองเพชร','Cactus',c.id,s.id,3,5,85,40
  FROM categories c, suppliers s WHERE c.code='succulent' AND s.code='SUP001'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO plants (sku, name, name_sci, category_id, supplier_id, stock, min_stock, price, cost)
SELECT 'PLT004','ใบเตย','Pandanus amaryllifolius',c.id,s.id,0,8,30,15
  FROM categories c, suppliers s WHERE c.code='herb' AND s.code='SUP002'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO plants (sku, name, name_sci, category_id, supplier_id, stock, min_stock, price, cost)
SELECT 'PLT005','ต้นโอ๊ค','Quercus',c.id,s.id,8,3,450,280
  FROM categories c, suppliers s WHERE c.code='tree' AND s.code='SUP003'
ON CONFLICT (sku) DO NOTHING;
