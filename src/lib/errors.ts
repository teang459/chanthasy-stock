export interface AppError {
  code?: string
  message?: string
}

const CODE_MAP: Record<string, string> = {
  '23505': 'ข้อมูลซ้ำกับที่มีอยู่แล้ว',
  '23503': 'ไม่สามารถลบได้เนื่องจากมีข้อมูลอ้างอิง',
  '42501': 'ไม่มีสิทธิ์ดำเนินการ',
}

export function userMessage(err: AppError | null | undefined): string {
  if (!err) return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
  if (err.code && CODE_MAP[err.code]) return CODE_MAP[err.code]
  const msg = err.message ?? ''
  if (msg.includes('Invalid login credentials')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
  if (msg.includes('Email rate limit exceeded'))  return 'ส่งอีเมลบ่อยเกินไป กรุณารอสักครู่'
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
}

const COMMON = ['password', 'password1', '12345678', '123456789', 'qwerty123']

export function passwordIssue(pw: string | null | undefined): string | null {
  if (!pw) return 'กรุณาระบุรหัสผ่าน'
  if (pw.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
  if (COMMON.includes(pw.toLowerCase())) return 'รหัสผ่านนี้พบบ่อยเกินไป กรุณาเลือกรหัสที่ปลอดภัยกว่า'
  if (!/\d/.test(pw)) return 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว'
  if (!/[a-zA-Z]/.test(pw)) return 'รหัสผ่านต้องมีตัวอักษรอย่างน้อย 1 ตัว'
  return null
}
