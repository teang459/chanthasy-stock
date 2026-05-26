// Map Supabase / Postgres errors to user-friendly Thai messages.
// Use `userMessage(err)` everywhere instead of `err.message`.

const PG_CODES = {
  '23505': 'ข้อมูลซ้ำกับที่มีอยู่แล้ว',
  '23503': 'ข้อมูลถูกอ้างอิงโดยรายการอื่น ไม่สามารถลบได้',
  '23502': 'ข้อมูลที่จำเป็นยังไม่ครบ',
  '23514': 'ค่าที่ระบุไม่ตรงกับเงื่อนไข',
  '42501': 'ไม่มีสิทธิ์ดำเนินการนี้',
  '42P01': 'ระบบไม่พบตารางที่อ้างถึง',
  'PGRST116': 'ไม่พบข้อมูลที่ต้องการ',
  'PGRST301': 'เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่',
}

const AUTH_PATTERNS = [
  { re: /invalid login credentials/i,    msg: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' },
  { re: /email rate limit/i,             msg: 'ส่งอีเมลบ่อยเกินไป กรุณารอสักครู่' },
  { re: /user already registered/i,      msg: 'อีเมลนี้สมัครใช้งานแล้ว' },
  { re: /password should be at least/i,  msg: 'รหัสผ่านสั้นเกินไป' },
  { re: /weak password/i,                msg: 'รหัสผ่านอ่อนเกินไป — ใช้ตัวอักษรและตัวเลขปนกัน' },
  { re: /network/i,                      msg: 'เครือข่ายมีปัญหา กรุณาลองอีกครั้ง' },
]

export function userMessage(err) {
  if (!err) return 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง'
  const code = err.code ?? err.error_code
  if (code && PG_CODES[code]) return PG_CODES[code]
  const msg = err.message || String(err)
  for (const { re, msg: m } of AUTH_PATTERNS) if (re.test(msg)) return m
  // Surface the raw error text instead of swallowing it — generic
  // "เกิดข้อผิดพลาด" hides the real cause (e.g. Edge Function 404 /
  // permission denied / non-Postgres failure) and makes diagnosis
  // impossible. Keep the Thai prefix so the UX stays consistent.
  return msg && msg !== '[object Object]'
    ? `เกิดข้อผิดพลาด: ${msg}`
    : 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง'
}

// Strong password: at least 8 chars, mix letters + digits, not in common list
const COMMON_PASSWORDS = new Set([
  'password', '12345678', 'qwerty12', 'abc12345', 'password1',
  '123456789', 'iloveyou', 'admin123', '11111111', 'letmein1',
])

export function passwordIssue(pw) {
  if (!pw)                                  return 'กรุณาระบุรหัสผ่าน'
  if (pw.length < 8)                        return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
  if (!/[A-Za-z]/.test(pw))                 return 'รหัสผ่านต้องมีตัวอักษรอย่างน้อย 1 ตัว'
  if (!/[0-9]/.test(pw))                    return 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว'
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'รหัสผ่านนี้พบบ่อยเกินไป กรุณาใช้รหัสที่ปลอดภัยกว่า'
  return null
}
