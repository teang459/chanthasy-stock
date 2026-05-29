import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (import.meta.env.DEV && (!url || !key || url.includes('your-project-id'))) {
  console.warn('⚠️ Supabase ยังไม่ได้ตั้งค่า — ตรวจสอบ .env.local')
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true },
})
