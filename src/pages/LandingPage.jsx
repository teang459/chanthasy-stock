import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import * as I from '../components/Icons'

// Bilingual content. Default = Thai; users can flip to Lao.
const T = {
  th: {
    nav_login: 'เข้าสู่ระบบ',
    hero_h1:    'ระบบจัดการสต็อกต้นไม้ครบวงจร',
    hero_sub:   'Multi-tenant SaaS ที่ออกแบบมาเพื่อร้านต้นไม้ ฟาร์ม โครงการ landscape — บันทึก ติดตาม รายงาน ออกใบเสร็จ ครบในที่เดียว',
    hero_cta_primary:   'เข้าสู่ระบบ',
    hero_cta_secondary: 'ดูฟีเจอร์ทั้งหมด',
    sec_features: 'ฟีเจอร์หลัก',
    feature_stock:    { title: 'จัดการสต็อกเรียลไทม์',  desc: 'อัปเดตจำนวนทันทีเมื่อมีการรับเข้า/จ่ายออก/ปรับสต็อก หลายคนแก้พร้อมกันได้' },
    feature_reports:  { title: 'รายงาน + Dashboard',      desc: 'มูลค่าตามหมวด, Top 10, อายุสต็อก, รายงานภาษีขาย พร้อม export CSV' },
    feature_invoice:  { title: 'ใบกำกับภาษี + ใบเสร็จ',   desc: 'ออกเอกสารเป็น PDF พิมพ์ได้ทันที รองรับ VAT 7% (inclusive/exclusive)' },
    feature_scanner:  { title: 'Barcode / QR Scanner',     desc: 'สแกนผ่านกล้องมือถือ → หาต้นไม้และปรับสต็อกได้ในไม่กี่วินาที' },
    feature_import:   { title: 'นำเข้าจาก Excel/CSV',      desc: 'ย้ายข้อมูลเดิม 500-2000 รายการในคลิกเดียว พร้อม validate และ preview' },
    feature_mobile:   { title: 'รองรับมือถือ + PWA',       desc: 'ติดตั้งเป็นแอปบน iOS / Android ได้ ทำงานออฟไลน์ได้บางส่วน' },
    feature_security: { title: 'ความปลอดภัยระดับองค์กร',   desc: '2FA, Row-Level Security, แยกข้อมูลแต่ละร้านอย่างเด็ดขาด' },
    feature_team:     { title: 'ทีมงานและสิทธิ์',          desc: 'Admin / Staff / Viewer พร้อม audit log การเปลี่ยนแปลงทุกรายการ' },
    sec_pricing: 'ราคา',
    pricing_h:   'ทดลองใช้ฟรี — ติดต่อขอบัญชีจากแอดมิน',
    pricing_sub: 'ปัจจุบันยังไม่มี public signup. ติดต่อทีมเราเพื่อตั้ง account ให้ร้านของคุณ',
    cta_contact: 'ติดต่อขอใช้งาน',
    footer_about: 'Chanthasy Stock — ระบบจัดการสต็อกต้นไม้',
    footer_terms: 'เงื่อนไขการใช้งาน',
    footer_privacy: 'ความเป็นส่วนตัว',
  },
  lo: {
    nav_login: 'ເຂົ້າສູ່ລະບົບ',
    hero_h1:    'ລະບົບຄຸ້ມຄອງສິນຄ້າຄົງຄັງຕົ້ນໄມ້ ຄົບວົງຈອນ',
    hero_sub:   'Multi-tenant SaaS ສຳລັບຮ້ານຕົ້ນໄມ້, ສວນ ແລະໂຄງການພູມສະຖາປັດ — ບັນທຶກ, ຕິດຕາມ, ລາຍງານ, ອອກໃບເສັດ ໃນທີ່ດຽວ',
    hero_cta_primary:   'ເຂົ້າສູ່ລະບົບ',
    hero_cta_secondary: 'ເບິ່ງຄຸນສົມບັດທັງໝົດ',
    sec_features: 'ຄຸນສົມບັດຫຼັກ',
    feature_stock:    { title: 'ຄຸ້ມຄອງສິນຄ້າແບບເຣຍລ໌ໄທ',  desc: 'ປັບປຸງຈຳນວນທັນທີເມື່ອມີການຮັບເຂົ້າ/ຈ່າຍອອກ/ປັບສະຕັອກ' },
    feature_reports:  { title: 'ລາຍງານ + Dashboard',     desc: 'ມູນຄ່າຕາມຫມວດ, Top 10, ອາຍຸສິນຄ້າ, ລາຍງານພາສີ ພ້ອມ export CSV' },
    feature_invoice:  { title: 'ໃບກຳກັບພາສີ + ໃບເສັດ',     desc: 'ອອກເອກະສານ PDF ໄດ້ທັນທີ ຮອງຮັບ VAT (inclusive/exclusive)' },
    feature_scanner:  { title: 'Barcode / QR Scanner',    desc: 'ສະແກນຜ່ານກ້ອງມືຖື → ຄົ້ນຫາສິນຄ້າ ແລະປັບສະຕັອກໄດ້ໃນວິນາທີ' },
    feature_import:   { title: 'ນຳເຂົ້າຈາກ Excel/CSV',    desc: 'ຍ້າຍຂໍ້ມູນເດີມ 500-2000 ລາຍການໃນຄລິກດຽວ ພ້ອມ validate' },
    feature_mobile:   { title: 'ຮອງຮັບມືຖື + PWA',         desc: 'ຕິດຕັ້ງເປັນແອັບໄດ້ໃນ iOS / Android ເຮັດວຽກອອບໄລນ໌ໄດ້ບາງສ່ວນ' },
    feature_security: { title: 'ຄວາມປອດໄພລະດັບອົງກອນ',     desc: '2FA, Row-Level Security, ແຍກຂໍ້ມູນແຕ່ລະຮ້ານ' },
    feature_team:     { title: 'ທີມງານ ແລະສິດທິ',          desc: 'Admin / Staff / Viewer ພ້ອມ audit log ການປ່ຽນແປງທຸກລາຍການ' },
    sec_pricing: 'ລາຄາ',
    pricing_h:   'ທົດລອງໃຊ້ຟຣີ — ຕິດຕໍ່ຂໍບັນຊີຈາກແອັດມິນ',
    pricing_sub: 'ປັດຈຸບັນຍັງບໍ່ມີ public signup. ຕິດຕໍ່ທີມພວກເຮົາເພື່ອຕັ້ງ account ໃຫ້ຮ້ານຂອງທ່ານ',
    cta_contact: 'ຕິດຕໍ່ຂໍໃຊ້ງານ',
    footer_about: 'Chanthasy Stock — ລະບົບຄຸ້ມຄອງສິນຄ້າຕົ້ນໄມ້',
    footer_terms: 'ເງື່ອນໄຂການໃຊ້ງານ',
    footer_privacy: 'ຄວາມເປັນສ່ວນຕົວ',
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

export default function LandingPage() {
  const [lang, setLang] = useState(() => localStorage.getItem('landing_lang') || 'th')
  const L = T[lang]

  function setLangAndStore(v) {
    setLang(v)
    localStorage.setItem('landing_lang', v)
  }

  function scrollToFeatures() {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <div className="brand-mark">CS</div>
          <strong>Chanthasy</strong>
        </div>
        <nav className="landing-nav-right">
          <div className="landing-lang">
            <button
              className={lang === 'th' ? 'active' : ''}
              onClick={() => setLangAndStore('th')}
              aria-label="ไทย"
            >TH</button>
            <button
              className={lang === 'lo' ? 'active' : ''}
              onClick={() => setLangAndStore('lo')}
              aria-label="ลາວ"
            >LA</button>
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
            <button className="btn btn-ghost landing-cta-big" onClick={scrollToFeatures}>{L.hero_cta_secondary}</button>
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
          <FeatureCard icon={<I.Box size={22} />}       title={L.feature_stock.title}    desc={L.feature_stock.desc} />
          <FeatureCard icon={<I.Chart size={22} />}     title={L.feature_reports.title}  desc={L.feature_reports.desc} />
          <FeatureCard icon={<I.Wallet size={22} />}    title={L.feature_invoice.title}  desc={L.feature_invoice.desc} />
          <FeatureCard icon={<I.QrCode size={22} />}    title={L.feature_scanner.title}  desc={L.feature_scanner.desc} />
          <FeatureCard icon={<I.Upload size={22} />}    title={L.feature_import.title}   desc={L.feature_import.desc} />
          <FeatureCard icon={<I.Package size={22} />}   title={L.feature_mobile.title}   desc={L.feature_mobile.desc} />
          <FeatureCard icon={<I.Lock size={22} />}      title={L.feature_security.title} desc={L.feature_security.desc} />
          <FeatureCard icon={<I.User size={22} />}      title={L.feature_team.title}     desc={L.feature_team.desc} />
        </div>
      </section>

      <section className="landing-section landing-pricing">
        <h2 className="landing-h2">{L.sec_pricing}</h2>
        <div className="landing-pricing-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{L.pricing_h}</h3>
          <p style={{ margin: 0, color: 'var(--muted)' }}>{L.pricing_sub}</p>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn btn-primary" to="/login">{L.nav_login} →</Link>
            <a className="btn btn-ghost" href="mailto:contact@chanthasy.com">{L.cta_contact}</a>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div>{L.footer_about}</div>
        <div className="landing-footer-links">
          <Link to="/login">{L.nav_login}</Link>
          <span>·</span>
          <a href="mailto:contact@chanthasy.com">{L.cta_contact}</a>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
          © {new Date().getFullYear()} Chanthasy
        </div>
      </footer>
    </div>
  )
}
