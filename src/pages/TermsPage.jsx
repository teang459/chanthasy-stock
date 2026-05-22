import React from 'react'

export default function TermsPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">ข้อกำหนดการใช้งาน</h1>
          <p className="page-sub">อัปเดตล่าสุด: 22 พฤษภาคม 2568</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720, padding: '32px 36px', lineHeight: 1.8, fontSize: 14 }}>
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>1. การยอมรับข้อกำหนด</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            การใช้งานระบบ Chanthasy Stock ("ระบบ") ถือว่าคุณยอมรับข้อกำหนดและเงื่อนไขการใช้งานฉบับนี้ทั้งหมด
            หากคุณไม่ยอมรับ กรุณาหยุดใช้งานระบบ
          </p>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>2. การใช้งานระบบ</h2>
          <p style={{ color: 'var(--muted)', margin: '0 0 8px' }}>คุณตกลงที่จะ:</p>
          <ul style={{ color: 'var(--muted)', margin: 0, paddingLeft: 20 }}>
            <li>ใช้ระบบเพื่อวัตถุประสงค์ที่ถูกกฎหมายเท่านั้น</li>
            <li>รักษาความปลอดภัยของบัญชีและรหัสผ่านของตนเอง</li>
            <li>ไม่พยายามเข้าถึงข้อมูลของผู้ใช้อื่น</li>
            <li>ไม่ใช้ระบบในลักษณะที่อาจก่อให้เกิดความเสียหายต่อระบบหรือผู้ใช้อื่น</li>
          </ul>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>3. ข้อมูลและความเป็นส่วนตัว</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            ข้อมูลที่คุณบันทึกในระบบเป็นของคุณ เราจะไม่เปิดเผยข้อมูลให้บุคคลภายนอกโดยไม่ได้รับความยินยอม
            ยกเว้นกรณีที่กฎหมายกำหนด โปรดอ่าน <a href="#/privacy" style={{ color: 'var(--primary)' }}>นโยบายความเป็นส่วนตัว</a> เพิ่มเติม
          </p>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>4. การจำกัดความรับผิด</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            ระบบให้บริการ "ตามสภาพที่เป็น" โดยไม่มีการรับประกันใดๆ ผู้ให้บริการไม่รับผิดชอบต่อ
            ความสูญเสียข้อมูลหรือความเสียหายใดๆ ที่เกิดจากการใช้งานระบบ
            ผู้ใช้ควรสำรองข้อมูลสำคัญด้วยตนเองเสมอ
          </p>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>5. การเปลี่ยนแปลงข้อกำหนด</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            เราขอสงวนสิทธิ์ในการเปลี่ยนแปลงข้อกำหนดนี้ได้ตลอดเวลา การใช้งานระบบต่อไปถือว่า
            ยอมรับข้อกำหนดที่แก้ไขแล้ว
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>6. การติดต่อ</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            หากมีข้อสงสัยเกี่ยวกับข้อกำหนดนี้ กรุณาติดต่อผู้ดูแลระบบ
          </p>
        </section>
      </div>
    </div>
  )
}
