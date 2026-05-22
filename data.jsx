// Plant nursery mock data

// Demo accounts (client-side only — no real auth backend)
const USERS = [
  { username: 'somjai',  password: 'admin123', name: 'คุณสมใจ',   role: 'เจ้าของร้าน · Admin',  initials: 'สม' },
  { username: 'staff1',  password: 'staff123', name: 'คุณมานะ',   role: 'พนักงาน · Staff',       initials: 'มน' },
  { username: 'viewer',  password: 'view123',  name: 'คุณนิดา',   role: 'ผู้ดูข้อมูล · Viewer',  initials: 'นด' },
];
const CATEGORIES = [
  { id: 'indoor',   th: 'ไม้ในร่ม',         en: 'Indoor',       hue: 145 },
  { id: 'outdoor',  th: 'ไม้กลางแจ้ง',     en: 'Outdoor',      hue: 95 },
  { id: 'flower',   th: 'ไม้ดอก',           en: 'Flowering',    hue: 18 },
  { id: 'succulent',th: 'ไม้อวบน้ำ',       en: 'Succulent',    hue: 175 },
  { id: 'air',      th: 'ไม้ฟอกอากาศ',     en: 'Air-purifying',hue: 200 },
  { id: 'bamboo',   th: 'ไผ่/หญ้า',         en: 'Bamboo & Grass',hue: 120 },
  { id: 'herb',     th: 'พืชสมุนไพร',      en: 'Herb',         hue: 80 },
];

const CAT_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const SUPPLIERS = [
  'สวนคุณนิด นนทบุรี',
  'จตุจักร — ล็อก 14',
  'ไร่สมพร เชียงราย',
  'นครปฐม การ์เด้น',
  'บ้านสวนภูเก็ต',
  'สมพรไม้ดอก ราชบุรี',
  'สวนพี่ตู่ ระยอง',
];

const SIZES = ['S — กระถาง 4"', 'M — กระถาง 6"', 'L — กระถาง 8"', 'XL — กระถาง 12"', 'หน่อ/ชำ', 'ลำต้นโต'];

const LOCATIONS = ['A-01', 'A-02', 'A-03', 'B-04', 'B-05', 'C-02', 'C-03', 'D-01', 'D-02', 'E-01', 'E-02', 'F-03'];

// Helper: deterministic date offset
function daysAgo(n) {
  const d = new Date('2026-05-21T00:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const PLANTS = [
  { sku: 'PLT-0142', name: 'มอนสเตอร่า ดิลิซิโอซ่า',  sci: 'Monstera deliciosa',     cat: 'indoor',    price: 850,  cost: 520, stock: 24, min: 6,  size: 'M — กระถาง 6"',  loc: 'A-01', supplier: 'สวนคุณนิด นนทบุรี', received: daysAgo(12), light: 'แสงรำไร', water: '2 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0089', name: 'ลิ้นมังกร',                sci: 'Sansevieria trifasciata',cat: 'air',       price: 320,  cost: 180, stock: 56, min: 10, size: 'M — กระถาง 6"',  loc: 'B-04', supplier: 'จตุจักร — ล็อก 14',  received: daysAgo(5),  light: 'ทนทุกสภาพ', water: '1 ครั้ง/2 สัปดาห์' },
  { sku: 'PLT-0203', name: 'ฟิโลเดนดรอน เบอร์กินดี้', sci: 'Philodendron erubescens',cat: 'indoor',    price: 1200, cost: 780, stock: 7,  min: 8,  size: 'L — กระถาง 8"',  loc: 'A-02', supplier: 'นครปฐม การ์เด้น',     received: daysAgo(28), light: 'แสงรำไร', water: '2 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0078', name: 'ยางอินเดีย',               sci: 'Ficus elastica',         cat: 'indoor',    price: 450,  cost: 260, stock: 38, min: 8,  size: 'M — กระถาง 6"',  loc: 'A-03', supplier: 'สวนคุณนิด นนทบุรี',   received: daysAgo(18), light: 'แสงปานกลาง', water: '1 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0034', name: 'พลูด่าง',                  sci: 'Epipremnum aureum',      cat: 'air',       price: 180,  cost: 90,  stock: 124,min: 20, size: 'S — กระถาง 4"',  loc: 'B-05', supplier: 'จตุจักร — ล็อก 14',    received: daysAgo(3),  light: 'แสงรำไร', water: '1 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0061', name: 'เดหลี',                    sci: 'Spathiphyllum wallisii', cat: 'air',       price: 280,  cost: 160, stock: 42, min: 10, size: 'M — กระถาง 6"',  loc: 'B-04', supplier: 'สวนคุณนิด นนทบุรี',    received: daysAgo(8),  light: 'แสงรำไร', water: '2 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0117', name: 'ปาล์มไผ่',                 sci: 'Chamaedorea seifrizii',  cat: 'indoor',    price: 650,  cost: 380, stock: 16, min: 6,  size: 'L — กระถาง 8"',  loc: 'A-01', supplier: 'ไร่สมพร เชียงราย',     received: daysAgo(22), light: 'แสงรำไร', water: '1 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0156', name: 'เศรษฐีเรือนใน',           sci: 'Chlorophytum comosum',   cat: 'air',       price: 150,  cost: 70,  stock: 88, min: 15, size: 'S — กระถาง 4"',  loc: 'B-05', supplier: 'จตุจักร — ล็อก 14',    received: daysAgo(2),  light: 'แสงรำไร', water: '1 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0241', name: 'ชวนชม',                    sci: 'Adenium obesum',         cat: 'flower',    price: 1800, cost: 1100,stock: 12, min: 4,  size: 'L — กระถาง 8"',  loc: 'C-02', supplier: 'สวนพี่ตู่ ระยอง',       received: daysAgo(35), light: 'แดดจัด', water: '2 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0188', name: 'โป๊ยเซียน',                sci: 'Euphorbia milii',        cat: 'flower',    price: 320,  cost: 180, stock: 30, min: 8,  size: 'M — กระถาง 6"',  loc: 'C-02', supplier: 'สมพรไม้ดอก ราชบุรี',  received: daysAgo(15), light: 'แดดจัด', water: '1 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0095', name: 'ลั่นทม',                   sci: 'Plumeria rubra',         cat: 'flower',    price: 950,  cost: 540, stock: 18, min: 6,  size: 'XL — กระถาง 12"',loc: 'C-03', supplier: 'สมพรไม้ดอก ราชบุรี',  received: daysAgo(45), light: 'แดดจัด', water: '2 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0312', name: 'กุหลาบหิน',                sci: 'Kalanchoe blossfeldiana',cat: 'succulent', price: 120,  cost: 60,  stock: 95, min: 15, size: 'S — กระถาง 4"',  loc: 'D-01', supplier: 'นครปฐม การ์เด้น',      received: daysAgo(7),  light: 'แดดอ่อน', water: '1 ครั้ง/2 สัปดาห์' },
  { sku: 'PLT-0411', name: 'ไทรใบสัก',                sci: 'Ficus lyrata',           cat: 'indoor',    price: 2400, cost: 1500,stock: 3,  min: 4,  size: 'XL — กระถาง 12"',loc: 'A-02', supplier: 'สวนคุณนิด นนทบุรี',    received: daysAgo(40), light: 'แสงสว่าง', water: '1 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0267', name: 'คาลาเทีย ออร์นาต้า',     sci: 'Calathea ornata',        cat: 'indoor',    price: 580,  cost: 340, stock: 22, min: 6,  size: 'M — กระถาง 6"',  loc: 'A-03', supplier: 'บ้านสวนภูเก็ต',        received: daysAgo(11), light: 'แสงรำไร', water: '3 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0173', name: 'ไผ่กิมซุง',                sci: 'Bambusa multiplex',      cat: 'bamboo',    price: 380,  cost: 220, stock: 34, min: 8,  size: 'L — กระถาง 8"',  loc: 'E-01', supplier: 'ไร่สมพร เชียงราย',     received: daysAgo(20), light: 'แดดจัด', water: '2 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0124', name: 'โกสน',                     sci: 'Codiaeum variegatum',    cat: 'outdoor',   price: 250,  cost: 140, stock: 68, min: 12, size: 'M — กระถาง 6"',  loc: 'E-02', supplier: 'สวนพี่ตู่ ระยอง',       received: daysAgo(14), light: 'แดดจัด', water: '1 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0098', name: 'ดอกแก้ว',                  sci: 'Murraya paniculata',     cat: 'flower',    price: 420,  cost: 240, stock: 26, min: 6,  size: 'L — กระถาง 8"',  loc: 'C-03', supplier: 'นครปฐม การ์เด้น',      received: daysAgo(26), light: 'แดดจัด', water: '2 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0067', name: 'มะลิลา',                   sci: 'Jasminum sambac',        cat: 'flower',    price: 180,  cost: 95,  stock: 0,  min: 10, size: 'M — กระถาง 6"',  loc: 'C-02', supplier: 'สมพรไม้ดอก ราชบุรี',  received: daysAgo(60), light: 'แดดจัด', water: '2 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0145', name: 'เฟิร์นบอสตัน',            sci: 'Nephrolepis exaltata',   cat: 'indoor',    price: 220,  cost: 110, stock: 44, min: 10, size: 'M — กระถาง 6"',  loc: 'B-04', supplier: 'บ้านสวนภูเก็ต',        received: daysAgo(9),  light: 'แสงรำไร', water: '3 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0298', name: 'แอสโตรไฟตัม',             sci: 'Astrophytum myriostigma',cat: 'succulent', price: 890,  cost: 560, stock: 14, min: 4,  size: 'S — กระถาง 4"',  loc: 'D-02', supplier: 'จตุจักร — ล็อก 14',    received: daysAgo(50), light: 'แดดจัด', water: '1 ครั้ง/2 สัปดาห์' },
  { sku: 'PLT-0301', name: 'แคคตัสบอลทอง',            sci: 'Echinocactus grusonii',  cat: 'succulent', price: 1500, cost: 940, stock: 5,  min: 6,  size: 'L — กระถาง 8"',  loc: 'D-02', supplier: 'จตุจักร — ล็อก 14',    received: daysAgo(55), light: 'แดดจัด', water: '1 ครั้ง/2 สัปดาห์' },
  { sku: 'PLT-0019', name: 'ออริกาโน่',                sci: 'Origanum vulgare',       cat: 'herb',      price: 95,   cost: 40,  stock: 78, min: 15, size: 'S — กระถาง 4"',  loc: 'F-03', supplier: 'ไร่สมพร เชียงราย',     received: daysAgo(4),  light: 'แดดจัด', water: '2 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0024', name: 'โหระพา',                   sci: 'Ocimum basilicum',       cat: 'herb',      price: 65,   cost: 25,  stock: 132,min: 25, size: 'S — กระถาง 4"',  loc: 'F-03', supplier: 'ไร่สมพร เชียงราย',     received: daysAgo(1),  light: 'แดดจัด', water: '3 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0254', name: 'เอคเวอเรีย',              sci: 'Echeveria elegans',      cat: 'succulent', price: 180,  cost: 85,  stock: 86, min: 12, size: 'S — กระถาง 4"',  loc: 'D-01', supplier: 'นครปฐม การ์เด้น',      received: daysAgo(6),  light: 'แดดอ่อน', water: '1 ครั้ง/2 สัปดาห์' },
  { sku: 'PLT-0181', name: 'หน้าวัวแดง',              sci: 'Anthurium andraeanum',   cat: 'flower',    price: 380,  cost: 210, stock: 19, min: 6,  size: 'M — กระถาง 6"',  loc: 'C-02', supplier: 'บ้านสวนภูเก็ต',        received: daysAgo(13), light: 'แสงรำไร', water: '2 ครั้ง/สัปดาห์' },
  { sku: 'PLT-0207', name: 'ว่านหางจระเข้',           sci: 'Aloe vera',              cat: 'herb',      price: 140,  cost: 60,  stock: 62, min: 12, size: 'M — กระถาง 6"',  loc: 'F-03', supplier: 'สวนพี่ตู่ ระยอง',       received: daysAgo(16), light: 'แดดจัด', water: '1 ครั้ง/2 สัปดาห์' },
  { sku: 'PLT-0322', name: 'พลูฉลุ',                   sci: 'Monstera adansonii',     cat: 'indoor',    price: 480,  cost: 280, stock: 28, min: 8,  size: 'M — กระถาง 6"',  loc: 'A-03', supplier: 'สวนคุณนิด นนทบุรี',    received: daysAgo(10), light: 'แสงรำไร', water: '2 ครั้ง/สัปดาห์' },
];

// Generate movement history — recent activity, sorted desc by date
const MOVEMENTS = [
  { id: 'MV-2841', sku: 'PLT-0034', type: 'in',  qty: 40,  date: daysAgo(3),  note: 'รับเข้าจากซัพพลายเออร์',         actor: 'แอดมิน' },
  { id: 'MV-2840', sku: 'PLT-0024', type: 'in',  qty: 60,  date: daysAgo(1),  note: 'รับเข้าจากซัพพลายเออร์',         actor: 'แอดมิน' },
  { id: 'MV-2839', sku: 'PLT-0142', type: 'out', qty: 4,   date: daysAgo(1),  note: 'ขายลูกค้า — บิล #SO-1247',         actor: 'พนักงาน 02' },
  { id: 'MV-2838', sku: 'PLT-0241', type: 'out', qty: 2,   date: daysAgo(2),  note: 'ขายลูกค้า — บิล #SO-1245',         actor: 'พนักงาน 01' },
  { id: 'MV-2837', sku: 'PLT-0411', type: 'out', qty: 1,   date: daysAgo(2),  note: 'ขายลูกค้า — บิล #SO-1244',         actor: 'พนักงาน 02' },
  { id: 'MV-2836', sku: 'PLT-0203', type: 'out', qty: 3,   date: daysAgo(3),  note: 'ขายลูกค้า — บิล #SO-1241',         actor: 'แอดมิน' },
  { id: 'MV-2835', sku: 'PLT-0067', type: 'out', qty: 8,   date: daysAgo(4),  note: 'ขายส่งร้านคุณส้ม',                 actor: 'แอดมิน' },
  { id: 'MV-2834', sku: 'PLT-0156', type: 'in',  qty: 30,  date: daysAgo(2),  note: 'รับเข้า — ชำเอง',                   actor: 'พนักงาน 03' },
  { id: 'MV-2833', sku: 'PLT-0078', type: 'adj', qty: -2,  date: daysAgo(5),  note: 'ตรวจนับ — เสียหาย/ใบเหลือง',       actor: 'แอดมิน' },
  { id: 'MV-2832', sku: 'PLT-0301', type: 'out', qty: 1,   date: daysAgo(6),  note: 'ขายลูกค้า — บิล #SO-1233',         actor: 'พนักงาน 02' },
  { id: 'MV-2831', sku: 'PLT-0019', type: 'in',  qty: 50,  date: daysAgo(4),  note: 'รับเข้าจากซัพพลายเออร์',         actor: 'แอดมิน' },
  { id: 'MV-2830', sku: 'PLT-0322', type: 'in',  qty: 18,  date: daysAgo(10), note: 'รับเข้า — ชำเอง',                   actor: 'พนักงาน 03' },
];

// Per-plant movement helper (most recent 6 for a sku)
function movementsFor(sku) {
  return MOVEMENTS.filter(m => m.sku === sku);
}

function plantBySku(sku) {
  return PLANTS.find(p => p.sku === sku);
}

function statusOf(p) {
  if (p.stock === 0) return 'out';
  if (p.stock < p.min) return 'low';
  return 'ok';
}

function statusLabel(s) {
  return s === 'out' ? 'หมดสต็อก' : s === 'low' ? 'ใกล้หมด' : 'พร้อมจำหน่าย';
}

function statusLabelEn(s) {
  return s === 'out' ? 'Out' : s === 'low' ? 'Low' : 'OK';
}

function formatBaht(n) {
  return n.toLocaleString('en-US');
}

function formatDateTh(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d.getDate()} ${months[d.getMonth()]} ${(d.getFullYear() + 543).toString().slice(-2)}`;
}

function daysSince(iso) {
  const d = new Date(iso);
  const now = new Date('2026-05-21T00:00:00');
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

Object.assign(window, {
  CATEGORIES, CAT_BY_ID, SUPPLIERS, SIZES, LOCATIONS,
  PLANTS, MOVEMENTS,
  movementsFor, plantBySku, statusOf, statusLabel, statusLabelEn,
  formatBaht, formatDateTh, daysSince, daysAgo,
});
