import { describe, it, expect } from 'vitest'
import { storagePath } from './image'

describe('storagePath', () => {
  it('extracts path from supabase public URL', () => {
    const url = 'https://kdsjqsfiunjhnajstwgi.supabase.co/storage/v1/object/public/plant-images/abc-123/photo.jpg'
    expect(storagePath(url)).toBe('abc-123/photo.jpg')
  })

  it('returns null for unrecognized URLs', () => {
    expect(storagePath('https://example.com/foo.jpg')).toBeNull()
    expect(storagePath('')).toBeNull()
    expect(storagePath(null)).toBeNull()
  })

  it('honors custom bucket name', () => {
    const url = 'https://x.supabase.co/storage/v1/object/public/avatars/u/me.png'
    expect(storagePath(url, 'avatars')).toBe('u/me.png')
  })
})
