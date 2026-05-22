import { describe, it, expect } from 'vitest'
import { userMessage, passwordIssue } from './errors'

describe('userMessage', () => {
  it('returns generic message for null/undefined', () => {
    expect(userMessage(null)).toMatch(/เกิดข้อผิดพลาด/)
    expect(userMessage(undefined)).toMatch(/เกิดข้อผิดพลาด/)
  })

  it('maps Postgres unique violation', () => {
    expect(userMessage({ code: '23505' })).toMatch(/ซ้ำ/)
  })

  it('maps Postgres FK violation', () => {
    expect(userMessage({ code: '23503' })).toMatch(/อ้างอิง/)
  })

  it('maps unauthorized', () => {
    expect(userMessage({ code: '42501' })).toMatch(/สิทธิ์/)
  })

  it('maps invalid login text pattern', () => {
    expect(userMessage({ message: 'Invalid login credentials' })).toMatch(/อีเมลหรือรหัสผ่าน/)
  })

  it('maps email rate limit', () => {
    expect(userMessage({ message: 'Email rate limit exceeded' })).toMatch(/บ่อยเกินไป/)
  })

  it('falls back to generic message for unknown errors', () => {
    expect(userMessage({ message: 'Something weird' })).toMatch(/เกิดข้อผิดพลาด/)
  })
})

describe('passwordIssue', () => {
  it('rejects empty', () => {
    expect(passwordIssue('')).toBeTruthy()
    expect(passwordIssue(null)).toBeTruthy()
  })

  it('rejects short passwords', () => {
    expect(passwordIssue('abc12')).toMatch(/8/)
  })

  it('rejects letters-only', () => {
    expect(passwordIssue('abcdefgh')).toMatch(/ตัวเลข/)
  })

  it('rejects digits-only', () => {
    expect(passwordIssue('12345678')).toMatch(/ตัวอักษร|พบบ่อย/)
  })

  it('rejects common passwords', () => {
    expect(passwordIssue('password1')).toMatch(/พบบ่อย/)
  })

  it('accepts a strong password', () => {
    expect(passwordIssue('SecurePass99')).toBeNull()
  })
})
