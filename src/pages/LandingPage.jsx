import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { userMessage } from '../lib/errors'
import * as I from '../components/Icons'
import Spinner from '../components/Spinner'

// Bilingual content. Default = Thai; users can flip to English.
const T = {
  th: {
    nav_login:  'เข้าสู่ระบบ',
    nav_pricing:'ราคา',
    hero_h1:    'ระบบจัดการสต็อกต้นไม้ครบวงจร',
    hero_sub:   'Multi-tenant SaaS ที่ออกแบบมาเพื่อร้านต้นไม้ ฟาร์ม โครงการ landscape — บันทึก ติดตาม รายงาน ออกใบเสร็จ ครบในที่เดียว',
    hero_cta_primary:   'เริ่มต้นใช้งานฟรี',
    hero_cta_secondary: 'ดูแพ็กเกจ',

    sec_features: 'ฟีเจอร์หลัก',
    feature_stock:    { title: 'จัดการสต็อกเรียลไทม์',  desc: 'อัปเดตจำนวนทันทีเมื่อมีการรับเข้า/จ่ายออก/ปรับสต็อก หลายคนแก้พร้อมกันได้' },
    feature_reports:  { title: 'รายงาน + Dashboard',      desc: 'มูลค่าตามหมวด, Top 10, อายุสต็อก, รายงานภาษีขาย พร้อม export CSV' },
    feature_invoice:  { title: 'ใบกำกับภาษี + ใบเสร็จ',   desc: 'ออกเอกสารเป็น PDF พิมพ์ได้ทันที รองรับ VAT 7% (inclusive/exclusive)' },
    feature_scanner:  { title: 'Barcode / QR Scanner',     desc: 'สแกนผ่านกล้องมือถือ → หาต้นไม้และปรับสต็อกได้ในไม่กี่วินาที' },
    feature_import:   { title: 'นำเข้าจาก Excel/CSV',      desc: 'ย้ายข้อมูลเดิม 500-2000 รายการในคลิกเดียว พร้อม validate และ preview' },
    feature_mobile:   { title: 'รองรับมือถือ + PWA',       desc: 'ติดตั้งเป็นแอปบน iOS / Android ได้ ทำงานออฟไลน์ได้บางส่วน' },
    feature_security: { title: 'ความปลอดภัยระดับองค์กร',   desc: '2FA, Row-Level Security, แยกข้อมูลแต่ละร้านอย่างเด็ดขาด' },
    feature_team:     { title: 'ทีมงานและสิทธิ์',          desc: 'Admin / Staff / Viewer พร้อม audit log การเปลี่ยนแปลงทุกรายการ' },

    sec_pricing:    'ราคา',
    pricing_h:      'เริ่มฟรี จ่ายเฉพาะเมื่อร้านโต',
    pricing_sub:    'แพ็กเกจ Free ทดลองไม่จำกัดเวลา · Pro 299 ฿/เดือน · Business 999 ฿/เดือน · ยกเลิกได้ทุกเมื่อ',
    pricing_cta:    'ดูแพ็กเกจทั้งหมด',

    sec_testimonials: 'เสียงจากผู้ใช้',
    testimonials: [
      { name: 'คุณนพ', shop: 'สวนพันธุ์ไม้นพ — เชียงใหม่', quote: 'เปลี่ยนจาก Excel มาเดือนเดียว นับสต็อกเร็วขึ้น 3 เท่า' },
      { name: 'คุณกุล', shop: 'Plantation House — กรุงเทพฯ', quote: 'รายงานออกเป็น PDF ส่งลูกค้าได้ทันที ดูมืออาชีพมาก' },
      { name: 'คุณมิ้น', shop: 'หน่อย Garden — ภูเก็ต', quote: 'เปิดบนมือถือก็ใช้ง่าย พนักงานปรับสต็อกผ่านสแกน QR ได้เลย' },
    ],

    sec_faq: 'คำถามที่พบบ่อย',
    faq: [
      { q: 'ลองใช้ฟรีได้ก่อนไหม?',                  a: 'ได้ครับ แพ็กเกจ Free ทดลองได้ตลอด — สูงสุด 50 รายการ + 2 สมาชิก ไม่ต้องใส่บัตรเครดิต' },
      { q: 'ย้ายข้อมูลจาก Excel ได้ไหม?',             a: 'ได้ครับ เมนู Bulk Import รองรับ CSV (อนาคต Excel) พร้อม validate ทุกแถวก่อนนำเข้า มีตัวอย่างให้ดาวน์โหลด' },
      { q: 'รองรับ VAT 7% ไหม?',                       a: 'รองรับเต็มรูปแบบ — เลือกได้ว่าราคารวม VAT หรือแยกบิล มีรายงานภาษีขาย/ซื้อแยกชัด' },
      { q: 'มีกี่สาขาก็ใช้ได้?',                          a: 'แพ็กเกจ Pro: 1 สาขา. Business: ไม่จำกัด. ข้อมูลแต่ละสาขาแยกอิสระด้วย Row-Level Security' },
      { q: 'ยกเลิกได้ทุกเมื่อ?',                          a: 'ยกเลิกได้เลยจากหน้า Billing — ใช้ได้จนถึงสิ้นรอบที่จ่ายไปแล้ว ไม่มีค่าธรรมเนียม' },
      { q: 'ข้อมูลปลอดภัยแค่ไหน?',                       a: 'Database hosted บน Supabase (EU) เข้ารหัสทั้ง at-rest และ in-transit, มี audit log ทุกการแก้ไข, รองรับ 2FA' },
    ],

    sec_contact:    'ติดต่อเรา',
    contact_intro:  'มีคำถาม? อยากให้ demo? บอกเราได้เลย',
    contact_name:   'ชื่อ',
    contact_email:  'อีเมล',
    contact_msg:    'ข้อความ',
    contact_send:   'ส่งข้อความ',
    contact_sent:   'ส่งข้อความแล้ว เราจะติดต่อกลับเร็วๆ นี้',
    contact_err:    'ส่งไม่สำเร็จ — กรุณาลองใหม่',
    contact_invalid:'กรุณากรอกข้อมูลให้ครบ',

    footer_about: 'Chanthasy Stock — ระบบจัดการสต็อกต้นไม้',
    footer_terms: 'เงื่อนไขการใช้งาน',
    footer_privacy: 'ความเป็นส่วนตัว',
  },
  en: {
    nav_login:  'Sign in',
    nav_pricing:'Pricing',
    hero_h1:    'Complete plant stock management system',
    hero_sub:   'Multi-tenant SaaS designed for plant shops, nurseries & landscape projects — record, track, report, invoice all in one place',
    hero_cta_primary:   'Start for free',
    hero_cta_secondary: 'See pricing',

    sec_features: 'Key Features',
    feature_stock:    { title: 'Real-time stock management',  desc: 'Update quantities instantly as items are received, sold, or adjusted. Multiple users can edit simultaneously' },
    feature_reports:  { title: 'Reports + Dashboard',         desc: 'Value by category, Top 10, stock age, sales tax reports with CSV export' },
    feature_invoice:  { title: 'Tax invoices + Receipts',     desc: 'Generate PDF documents instantly. Print ready. Supports 7% VAT (inclusive/exclusive)' },
    feature_scanner:  { title: 'Barcode / QR Scanner',        desc: 'Scan via mobile camera → find items and adjust stock in seconds' },
    feature_import:   { title: 'Import from Excel/CSV',       desc: 'Migrate 500–2000 items in one click with validation and preview' },
    feature_mobile:   { title: 'Mobile + PWA support',        desc: 'Install as an app on iOS / Android. Works partially offline' },
    feature_security: { title: 'Enterprise-grade security',   desc: '2FA, Row-Level Security, strict data isolation per store' },
    feature_team:     { title: 'Team & permissions',          desc: 'Admin / Staff / Viewer roles plus audit log of every change' },

    sec_pricing:    'Pricing',
    pricing_h:      'Start free, pay only when you grow',
    pricing_sub:    'Free forever · Pro 299 THB/mo · Business 999 THB/mo · Cancel anytime',
    pricing_cta:    'See all plans',

    sec_testimonials: 'Loved by plant shops',
    testimonials: [
      { name: 'Nop',  shop: 'Nop\'s Nursery — Chiang Mai',     quote: 'Moved off Excel in a month. Stock counts now take a third of the time.' },
      { name: 'Kul',  shop: 'Plantation House — Bangkok',      quote: 'PDF reports look polished — clients trust the numbers immediately.' },
      { name: 'Min',  shop: 'Noi Garden — Phuket',             quote: 'Mobile-first means staff just scan a QR and update stock on the spot.' },
    ],

    sec_faq: 'Frequently asked',
    faq: [
      { q: 'Is there a free tier?',          a: 'Yes — Free forever, up to 50 items + 2 users, no credit card.' },
      { q: 'Can I import from Excel?',       a: 'CSV import is live (Excel coming). Every row is validated before insert and a template is provided.' },
      { q: 'Does it handle Thai 7% VAT?',    a: 'Fully — switch between inclusive and exclusive pricing, separate sales tax / purchase tax reports.' },
      { q: 'How many stores can I have?',    a: 'Pro: 1 store. Business: unlimited. Each store is isolated via Row-Level Security.' },
      { q: 'Can I cancel anytime?',          a: 'Cancel from the Billing page anytime. You keep access until the end of the paid period. No fees.' },
      { q: 'How secure is my data?',         a: 'Supabase-hosted DB (EU region), encrypted at rest and in transit, full audit log, 2FA supported.' },
    ],

    sec_contact:    'Get in touch',
    contact_intro:  'Have questions or want a live demo? Drop us a line.',
    contact_name:   'Name',
    contact_email:  'Email',
    contact_msg:    'Message',
    contact_send:   'Send message',
    contact_sent:   'Message sent — we\'ll be in touch shortly.',
    contact_err:    'Failed to send — please try again',
    contact_invalid:'Please fill in all fields',

    footer_about: 'Chanthasy Stock — plant stock management system',
    footer_terms: 'Terms of use',
    footer_privacy: 'Privacy policy',
  },
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="landing-feat">
      <div className="landing-feat-icon">{icon}</div>
      <h3 className="landing-feat-title">{title}</h3>
      <p className="landing-feat-desc">{desc}</p>
    </div>
  )
}

function TestimonialCard({ name, shop, quote }) {
  return (
    <figure className="landing-testimonial">
      <blockquote className="landing-testimonial-quote">"{quote}"</blockquote>
      <figcaption className="landing-testimonial-cite">
        <strong>{name}</strong>
        <span>{shop}</span>
      </figcaption>
    </figure>
  )
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`landing-faq-item ${open ? 'is-open' : ''}`}>
      <button type="button" className="landing-faq-q" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>{q}</span>
        <I.Chevron size={14} />
      </button>
      {open && <div className="landing-faq-a">{a}</div>}
    </div>
  )
}

function ContactForm({ L }) {
  const [form,    setForm]    = useState({ name: '', email: '', message: '', website: '' })
  const [status,  setStatus]  = useState('idle')   // idle | sending | sent | error
  const [errMsg,  setErrMsg]  = useState('')

  function field(k) {
    return e => setForm(f => ({ ...f, [k]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setStatus('error'); setErrMsg(L.contact_invalid); return
    }
    setStatus('sending'); setErrMsg('')
    try {
      const { data, error } = await supabase.functions.invoke('submit-contact', {
        body: form,
      })
      if (error || !data?.ok) throw error || new Error(L.contact_err)
      setStatus('sent')
      setForm({ name: '', email: '', message: '', website: '' })
    } catch (err) {
      setStatus('error')
      setErrMsg(userMessage(err) || L.contact_err)
    }
  }

  if (status === 'sent') {
    return (
      <div className="landing-contact-sent">
        <I.Check size={20} />
        <p>{L.contact_sent}</p>
      </div>
    )
  }

  return (
    <form className="landing-contact-form" onSubmit={handleSubmit} noValidate>
      <label>
        <span>{L.contact_name}</span>
        <input value={form.name} onChange={field('name')} required />
      </label>
      <label>
        <span>{L.contact_email}</span>
        <input type="email" value={form.email} onChange={field('email')} required />
      </label>
      <label>
        <span>{L.contact_msg}</span>
        <textarea rows={4} value={form.message} onChange={field('message')} required maxLength={5000} />
      </label>
      {/* Honeypot — hidden from real users, bots fill it and get rejected */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={form.website}
        onChange={field('website')}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
        aria-hidden="true"
      />
      {status === 'error' && <div className="landing-contact-err">{errMsg}</div>}
      <button type="submit" className="btn btn-primary" disabled={status === 'sending'}>
        {status === 'sending' ? <Spinner size={14} color="#fff" /> : L.contact_send}
      </button>
    </form>
  )
}

export default function LandingPage() {
  const [lang, setLang] = useState(() => localStorage.getItem('landing_lang') || 'th')
  const L = T[lang]

  function setLangAndStore(v) {
    setLang(v)
    localStorage.setItem('landing_lang', v)
  }

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <div className="brand-mark">CS</div>
          <strong>Chanthasy</strong>
        </div>
        <nav className="landing-nav-right">
          <Link className="landing-nav-link" to="/pricing">{L.nav_pricing}</Link>
          <div className="landing-lang">
            <button className={lang === 'th' ? 'active' : ''} onClick={() => setLangAndStore('th')} aria-label="ไทย">TH</button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLangAndStore('en')} aria-label="English">EN</button>
          </div>
          <Link className="btn btn-primary" to="/login">{L.nav_login} →</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-inner">
          <h1 className="landing-h1">{L.hero_h1}</h1>
          <p className="landing-hero-sub">{L.hero_sub}</p>
          <div className="landing-hero-cta">
            <Link className="btn btn-primary landing-cta-big" to="/login">{L.hero_cta_primary} →</Link>
            <Link className="btn btn-ghost landing-cta-big" to="/pricing">{L.hero_cta_secondary}</Link>
          </div>
        </div>
        <div className="landing-hero-mock" aria-hidden="true">
          <div className="mock-card">
            <div className="mock-stat"><span>📦</span><strong>247</strong><em>รายการ</em></div>
            <div className="mock-stat"><span>📊</span><strong>฿1.2M</strong><em>มูลค่า</em></div>
            <div className="mock-stat mock-alert"><span>⚠️</span><strong>8</strong><em>ใกล้หมด</em></div>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section">
        <h2 className="landing-h2">{L.sec_features}</h2>
        <div className="landing-features-grid">
          <FeatureCard icon={<I.Box size={22} />}     title={L.feature_stock.title}    desc={L.feature_stock.desc} />
          <FeatureCard icon={<I.Chart size={22} />}   title={L.feature_reports.title}  desc={L.feature_reports.desc} />
          <FeatureCard icon={<I.Download size={22} />} title={L.feature_invoice.title} desc={L.feature_invoice.desc} />
          <FeatureCard icon={<I.Search size={22} />}  title={L.feature_scanner.title}  desc={L.feature_scanner.desc} />
          <FeatureCard icon={<I.Upload size={22} />}  title={L.feature_import.title}   desc={L.feature_import.desc} />
          <FeatureCard icon={<I.Tag size={22} />}     title={L.feature_mobile.title}   desc={L.feature_mobile.desc} />
          <FeatureCard icon={<I.Lock size={22} />}    title={L.feature_security.title} desc={L.feature_security.desc} />
          <FeatureCard icon={<I.User size={22} />}    title={L.feature_team.title}     desc={L.feature_team.desc} />
        </div>
      </section>

      <section id="testimonials" className="landing-section landing-section--alt">
        <h2 className="landing-h2">{L.sec_testimonials}</h2>
        <div className="landing-testimonials-grid">
          {L.testimonials.map((t, i) => <TestimonialCard key={i} {...t} />)}
        </div>
      </section>

      <section id="pricing" className="landing-section landing-pricing">
        <h2 className="landing-h2">{L.sec_pricing}</h2>
        <div className="landing-pricing-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{L.pricing_h}</h3>
          <p style={{ margin: 0, color: 'var(--muted)' }}>{L.pricing_sub}</p>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn btn-primary" to="/pricing">{L.pricing_cta} →</Link>
            <Link className="btn btn-ghost" to="/login">{L.nav_login}</Link>
          </div>
        </div>
      </section>

      <section id="faq" className="landing-section landing-section--alt">
        <h2 className="landing-h2">{L.sec_faq}</h2>
        <div className="landing-faq">
          {L.faq.map((item, i) => <FaqItem key={i} q={item.q} a={item.a} />)}
        </div>
      </section>

      <section id="contact" className="landing-section">
        <h2 className="landing-h2">{L.sec_contact}</h2>
        <p className="landing-contact-intro">{L.contact_intro}</p>
        <ContactForm L={L} />
      </section>

      <footer className="landing-footer">
        <div>{L.footer_about}</div>
        <div className="landing-footer-links">
          <button type="button" className="landing-footer-link" onClick={() => scrollTo('pricing')}>{L.sec_pricing}</button>
          <span>·</span>
          <button type="button" className="landing-footer-link" onClick={() => scrollTo('contact')}>{L.sec_contact}</button>
          <span>·</span>
          <Link to="/login">{L.nav_login}</Link>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
          © {new Date().getFullYear()} Chanthasy
        </div>
      </footer>
    </div>
  )
}
