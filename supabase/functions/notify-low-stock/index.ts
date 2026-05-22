import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const SUPA_URL   = Deno.env.get('SUPABASE_URL') ?? ''
const SUPA_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async () => {
  if (!RESEND_KEY) return new Response('RESEND_API_KEY not set', { status: 500 })

  const authH = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
  }

  // Load all plants
  const plantsRes = await fetch(SUPA_URL + '/rest/v1/plants?select=id,name,sku,stock,min_stock,owner_id', { headers: authH })
  const plants: any[] = await plantsRes.json()

  // Filter low stock (stock <= min_stock)
  const low = plants.filter(p => p.stock <= p.min_stock)
  if (!low.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

  // Group by owner
  const byOwner: Record<string, any[]> = {}
  for (const p of low) {
    if (!byOwner[p.owner_id]) byOwner[p.owner_id] = []
    byOwner[p.owner_id].push(p)
  }

  let sent = 0
  for (const [ownerId, ownerPlants] of Object.entries(byOwner)) {
    // Get user email
    const userRes = await fetch(SUPA_URL + '/auth/v1/admin/users/' + ownerId, { headers: authH })
    const user = await userRes.json()
    if (!user?.email) continue

    // Get profile for shop name
    const profRes = await fetch(SUPA_URL + '/rest/v1/profiles?id=eq.' + ownerId + '&select=shop_name,name', { headers: authH })
    const profiles: any[] = await profRes.json()
    const profile = Array.isArray(profiles) ? profiles[0] : null
    const shopName = profile?.shop_name || profile?.name || 'ร้านของคุณ'

    const rows = ownerPlants.map((p: any) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${p.sku}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${p.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#e53e3e;font-weight:700">${p.stock}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${p.min_stock}</td>
      </tr>`
    ).join('')

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#1a202c">⚠️ สต็อกต่ำ — ${shopName}</h2>
        <p style="color:#4a5568">มีสินค้า <strong>${ownerPlants.length} รายการ</strong> ที่ต้องเติมสต็อก</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px">
          <thead>
            <tr style="background:#f7fafc">
              <th style="padding:8px 12px;text-align:left">SKU</th>
              <th style="padding:8px 12px;text-align:left">ชื่อต้นไม้</th>
              <th style="padding:8px 12px;text-align:left">สต็อก</th>
              <th style="padding:8px 12px;text-align:left">ขั้นต่ำ</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#a0aec0;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
          ส่งโดย Chanthasy Stock อัตโนมัติทุกวัน 08:00 น.
        </p>
      </div>
    `

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Chanthasy Stock <onboarding@resend.dev>',
        to: [user.email],
        subject: `⚠️ สต็อกต่ำ ${ownerPlants.length} รายการ — ${shopName}`,
        html,
      }),
    })
    if (emailRes.ok) sent++
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
