import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  // Verify the caller is an admin using their own JWT
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: { user: caller }, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !caller) {
    console.error('getUser failed:', userErr?.message)
    return json({ error: 'Unauthorized' }, 401)
  }

  const { data: profile, error: profileErr } = await callerClient
    .from('profiles')
    .select('role, manager_id')
    .eq('id', caller.id)
    .single()

  if (profileErr) console.error('profile fetch error:', profileErr.message)

  if (!profile || profile.role !== 'admin' || profile.manager_id !== null) {
    console.error('Forbidden: profile=', JSON.stringify(profile))
    return json({ error: 'Forbidden' }, 403)
  }

  let body: { action: string; email?: string; password?: string; name?: string; shop_name?: string; role?: string; userId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { action } = body

  // ── Create user ────────────────────────────────────────────────
  if (action === 'create') {
    const { email, password, name, shop_name, role = 'staff' } = body
    if (!email || !password) return json({ error: 'email and password required' }, 400)

    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name || '' },
    })
    if (error) return json({ error: error.message }, 400)

    // Trigger creates the profile; update with admin-supplied fields
    if (data.user) {
      const initials = name
        ? name.trim().slice(0, 2).toUpperCase()
        : email.slice(0, 2).toUpperCase()

      await serviceClient.from('profiles').upsert({
        id: data.user.id,
        name: name?.trim() || email.split('@')[0],
        role,
        shop_name: shop_name?.trim() || null,
        initials,
      })
    }

    return json({ user: data.user })
  }

  // ── Delete user ────────────────────────────────────────────────
  if (action === 'delete') {
    const { userId } = body
    if (!userId) return json({ error: 'userId required' }, 400)
    if (userId === caller.id) return json({ error: 'Cannot delete your own account' }, 400)

    // Best-effort cleanup of plant images so storage doesn't accumulate orphans
    try {
      const { data: files } = await serviceClient.storage.from('plant-images').list(userId, { limit: 1000 })
      if (files && files.length > 0) {
        const paths = files.map(f => `${userId}/${f.name}`)
        await serviceClient.storage.from('plant-images').remove(paths)
      }
    } catch (e) {
      console.error('storage cleanup (non-fatal):', (e as Error).message)
    }

    // ON DELETE CASCADE handles plants/movements/profile/etc.
    // log_plant_event trigger skips logging when owner is being cascade-deleted (migration 003)
    const { error } = await serviceClient.auth.admin.deleteUser(userId)
    if (error) {
      console.error('deleteUser error:', error.message)
      return json({ error: error.message }, 400)
    }

    return json({ success: true })
  }

  return json({ error: 'Unknown action' }, 400)
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
