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

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: { user: caller }, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !caller) {
    console.error('getUser failed:', userErr?.message)
    return json({ error: 'Unauthorized' }, 401)
  }

  // Post Phase C: super_admin is the only role with cross-tenant write powers.
  const { data: profile, error: profileErr } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (profileErr) console.error('profile fetch error:', profileErr.message)

  if (!profile || profile.role !== 'super_admin') {
    console.error('Forbidden: profile=', JSON.stringify(profile))
    return json({ error: 'Forbidden' }, 403)
  }

  type Body = {
    action: string
    email?: string
    password?: string
    name?: string
    userId?: string
  }
  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { action } = body

  // ── Create user ────────────────────────────────────────────────
  if (action === 'create') {
    const { email, password, name } = body
    if (!email || !password) return json({ error: 'email and password required' }, 400)

    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name || '' },
    })
    if (error) return json({ error: error.message }, 400)

    // The handle_new_user trigger creates the profile with role='member' by
    // default. We just patch the displayed name / initials when provided.
    if (data.user && name?.trim()) {
      const initials = name.trim().slice(0, 2).toUpperCase()
      await serviceClient.from('profiles').update({
        name: name.trim(),
        initials,
      }).eq('id', data.user.id)
    }

    // Audit log (write directly with service role; the table is otherwise append-only)
    if (data.user) {
      const actorEmail = caller.email ?? null
      await serviceClient.from('audit_logs').insert({
        actor_id: caller.id,
        actor_email: actorEmail,
        action: 'user.create',
        entity_type: 'user',
        entity_id: data.user.id,
        metadata: { email, name: name ?? null },
      })
    }

    return json({ user: data.user })
  }

  // ── Delete user ────────────────────────────────────────────────
  if (action === 'delete') {
    const { userId } = body
    if (!userId) return json({ error: 'userId required' }, 400)
    if (userId === caller.id) return json({ error: 'Cannot delete your own account' }, 400)

    // Best-effort cleanup of plant images stored under the user's id folder.
    // (After the multi-store cutover stores own folders are keyed by store id;
    // legacy users still have a folder named after their auth uid.)
    try {
      const { data: files } = await serviceClient.storage.from('plant-images').list(userId, { limit: 1000 })
      if (files && files.length > 0) {
        const paths = files.map(f => `${userId}/${f.name}`)
        await serviceClient.storage.from('plant-images').remove(paths)
      }
    } catch (e) {
      console.error('storage cleanup (non-fatal):', (e as Error).message)
    }

    // Look up the target's email + name BEFORE deleting so we can audit it
    const { data: targetProfile } = await serviceClient
      .from('profiles').select('name').eq('id', userId).maybeSingle()
    const { data: targetUser } = await serviceClient.auth.admin.getUserById(userId)

    // ON DELETE CASCADE clears profile, store_members, and (for legacy owner_id
    // rows) plants/movements/etc. store rows are kept (created_by → SET NULL).
    const { error } = await serviceClient.auth.admin.deleteUser(userId)
    if (error) {
      console.error('deleteUser error:', error.message)
      return json({ error: error.message }, 400)
    }

    await serviceClient.from('audit_logs').insert({
      actor_id: caller.id,
      actor_email: caller.email ?? null,
      action: 'user.delete',
      entity_type: 'user',
      entity_id: userId,
      metadata: {
        target_email: targetUser?.user?.email ?? null,
        target_name: targetProfile?.name ?? null,
      },
    })

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
