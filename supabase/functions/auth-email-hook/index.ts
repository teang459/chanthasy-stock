Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set')
    return new Response(JSON.stringify({ error: 'Missing RESEND_API_KEY' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const APP_URL    = Deno.env.get('APP_URL')    ?? 'https://teang459.github.io/chanthasy-stock'
  const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Chanthasy Stock <onboarding@resend.dev>'
  const SUPA_URL   = Deno.env.get('SUPABASE_URL') ?? 'https://kdsjqsfiunjhnajstwgi.supabase.co'

  let payload: { user: { email: string }; email_data: { token_hash: string; redirect_to: string; email_action_type: string } }
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { user, email_data } = payload
  const { token_hash, redirect_to, email_action_type } = email_data

  const confirmUrl =
    `${SUPA_URL}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(redirect_to || APP_URL)}`

  const subjects: Record<string, string> = {
    signup: 'ยืนยันอีเมลของคุณ – Chanthasy Stock',
    recovery: 'รีเซ็ตรหัสผ่าน – Chanthasy Stock',
    email_change: 'ยืนยันการเปลี่ยนอีเมล – Chanthasy Stock',
  }
  const subject = subjects[email_action_type] ?? 'Chanthasy Stock'

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
      <h2 style="color:#2e7d32">Chanthasy Stock 🌿</h2>
      <p>สวัสดี,</p>
      <p>${
        email_action_type === 'signup'
          ? 'ขอบคุณที่สมัครใช้งาน! คลิกปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งาน'
          : email_action_type === 'recovery'
          ? 'คุณได้ขอรีเซ็ตรหัสผ่าน คลิกปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่'
          : 'คลิกปุ่มด้านล่างเพื่อยืนยันการเปลี่ยนอีเมล'
      }</p>
      <a href="${confirmUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#2e7d32;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        ${email_action_type === 'signup' ? 'ยืนยันอีเมล' : email_action_type === 'recovery' ? 'รีเซ็ตรหัสผ่าน' : 'ยืนยัน'}
      </a>
      <p style="margin-top:24px;color:#888;font-size:12px">หากคุณไม่ได้เป็นผู้ดำเนินการ กรุณาเพิกเฉยต่ออีเมลนี้</p>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [user.email],
      subject,
      html,
    }),
  })

  const body = await res.json()
  if (!res.ok) {
    console.error('Resend error:', JSON.stringify(body))
    return new Response(JSON.stringify({ error: 'Email send failed', details: body }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
