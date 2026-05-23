import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
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

  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) return json({ error: 'Unauthorized' }, 401)

  const { data: profile } = await callerClient
    .from('profiles')
    .select('role, manager_id')
    .eq('id', caller.id)
    .single()

  if (!profile || profile.role !== 'admin' || profile.manager_id !== null) {
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

    // ON DELETE CASCADE handles all related data automatically
    const { error } = await serviceClient.auth.admin.deleteUser(userId)
    if (error) return json({ error: error.message }, 400)

    return json({ success: true })
  }

  return json({ error: 'Unknown action' }, 400)
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
