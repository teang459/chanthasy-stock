import { describe, it, expect } from 'vitest'
import { suggestStoreCode } from './admin'

describe('suggestStoreCode', () => {
  it('returns STR001 for an empty list', () => {
    expect(suggestStoreCode([])).toBe('STR001')
    expect(suggestStoreCode()).toBe('STR001')
  })

  it('increments past the highest numeric suffix', () => {
    expect(suggestStoreCode([{ code: 'STR001' }, { code: 'STR002' }, { code: 'STR003' }])).toBe('STR004')
    expect(suggestStoreCode([{ code: 'STR009' }])).toBe('STR010')
    expect(suggestStoreCode([{ code: 'STR099' }])).toBe('STR100')
  })

  it('ignores codes with no numeric suffix', () => {
    expect(suggestStoreCode([{ code: 'BANGKOK' }, { code: 'CNX' }])).toBe('STR001')
    expect(suggestStoreCode([{ code: 'BKK' }, { code: 'STR005' }])).toBe('STR006')
  })

  it('handles missing / null code fields', () => {
    expect(suggestStoreCode([{}, { code: null }, { code: 'STR007' }])).toBe('STR008')
  })

  it('handles non-standard prefixes by reading any digits', () => {
    expect(suggestStoreCode([{ code: 'BKK01' }, { code: 'BKK02' }])).toBe('STR003')
  })
})
