// Landing-page contact form → email via Resend.
//
// Public endpoint (no JWT). Deploy with --no-verify-jwt. Three defences
// keep it from becoming a spam relay:
//   1. honeypot field "website" must be empty (real users can't see it)
//   2. message length caps to discourage abusers from blasting walls of text
//   3. CORS open but only POST allowed; preflight returns fast
//
// Required env:
//   RESEND_API_KEY   — same key used by auth-email-hook
//   CONTACT_TO_EMAIL — destination inbox; defaults to chanthasymb45@gmail.com
//   FROM_EMAIL       — sender label; falls back to onboarding@resend.dev

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json(405, { error: 'Method not allowed' })

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const TO_EMAIL       = Deno.env.get('CONTACT_TO_EMAIL') ?? 'chanthasymb45@gmail.com'
  const FROM_EMAIL     = Deno.env.get('FROM_EMAIL')       ?? 'Chanthasy Stock <onboarding@resend.dev>'
  if (!RESEND_API_KEY) return json(500, { error: 'Email service not configured' })

  let body: { name?: string; email?: string; message?: string; website?: string }
  try { body = await req.json() }
  catch { return json(400, { error: 'Invalid JSON' }) }

  // Honeypot: real users never fill this field (it's hidden via CSS).
  if (body.website && body.website.trim() !== '') {
    // Pretend success so bots stop retrying.
    return json(200, { ok: true })
  }

  const name    = (body.name    ?? '').trim()
  const email   = (body.email   ?? '').trim()
  const message = (body.message ?? '').trim()

  if (!name || !email || !message) {
    return json(400, { error: 'name, email, message required' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'Invalid email' })
  }
  if (message.length > 5000) {
    return json(400, { error: 'Message too long (max 5000 chars)' })
  }

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#2e7d32;margin:0 0 16px">ข้อความใหม่จาก Landing Page</h2>
      <table style="font-size:14px;width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#888;width:80px">ชื่อ</td><td style="padding:6px 0;font-weight:600">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:6px 0;color:#888">อีเมล</td><td style="padding:6px 0"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e8e5de;margin:16px 0" />
      <div style="white-space:pre-wrap;font-size:14px;line-height:1.6">${escapeHtml(message)}</div>
      <p style="color:#888;font-size:11px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
        ส่งโดยอัตโนมัติจาก Landing Page contact form
      </p>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      reply_to: email,
      subject: `[Landing] ${name}`,
      html,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[submit-contact] Resend failed:', res.status, detail)
    return json(500, { error: 'Failed to send' })
  }

  return json(200, { ok: true })
})
