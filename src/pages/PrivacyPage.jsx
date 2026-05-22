import React from 'react'

export default function PrivacyPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">นโยบายความเป็นส่วนตัว</h1>
          <p className="page-sub">อัปเดตล่าสุด: 22 พฤษภาคม 2568 · สอดคล้องกับ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720, padding: '32px 36px', lineHeight: 1.8, fontSize: 14 }}>
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>1. ข้อมูลที่เราเก็บรวบรวม</h2>
          <p style={{ color: 'var(--muted)', margin: '0 0 8px' }}>เราเก็บข้อมูลเพียงเท่าที่จำเป็นสำหรับการให้บริการ:</p>
          <ul style={{ color: 'var(--muted)', margin: 0, paddingLeft: 20 }}>
            <li><strong>ข้อมูลบัญชี:</strong> อีเมลและรหัสผ่าน (เข้ารหัสโดย Supabase Auth)</li>
            <li><strong>ข้อมูลโปรไฟล์:</strong> ชื่อ ชื่อร้าน บทบาท</li>
            <li><strong>ข้อมูลสินค้า:</strong> ข้อมูลต้นไม้ สต็อก ราคา และประวัติการเคลื่อนไหว</li>
            <li><strong>ข้อมูลการใช้งาน:</strong> ไม่มีการเก็บข้อมูล analytics หรือ tracking</li>
          </ul>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>2. วัตถุประสงค์ในการใช้ข้อมูล</h2>
          <ul style={{ color: 'var(--muted)', margin: 0, paddingLeft: 20 }}>
            <li>ให้บริการระบบจัดการสต็อกแก่คุณ</li>
            <li>ส่งการแจ้งเตือนสต็อกต่ำทางอีเมล (เฉพาะเมื่อเปิดใช้งาน)</li>
            <li>ยืนยันตัวตนและรักษาความปลอดภัยของบัญชี</li>
          </ul>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>3. การจัดเก็บและความปลอดภัย</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            ข้อมูลทั้งหมดจัดเก็บบน Supabase (AWS Singapore) ซึ่งเป็นไปตามมาตรฐาน ISO 27001
            มีการเข้ารหัสข้อมูลทั้งระหว่างการส่ง (TLS) และขณะจัดเก็บ
          </p>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>4. สิทธิ์ของคุณตาม PDPA</h2>
          <p style={{ color: 'var(--muted)', margin: '0 0 8px' }}>คุณมีสิทธิ์ในการ:</p>
          <ul style={{ color: 'var(--muted)', margin: 0, paddingLeft: 20 }}>
            <li><strong>เข้าถึง:</strong> ขอดูข้อมูลส่วนบุคคลที่เราเก็บ</li>
            <li><strong>แก้ไข:</strong> แก้ไขข้อมูลได้ตลอดเวลาในหน้าตั้งค่า</li>
            <li><strong>ลบ:</strong> ขอลบบัญชีและข้อมูลทั้งหมด</li>
            <li><strong>คัดค้าน:</strong> ปฏิเสธการประมวลผลข้อมูลในบางกรณี</li>
            <li><strong>โอนย้าย:</strong> ส่งออกข้อมูลในรูปแบบ CSV ได้จากหน้าสต็อก</li>
          </ul>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>5. การแชร์ข้อมูล</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            เราไม่ขายหรือเปิดเผยข้อมูลส่วนบุคคลให้บุคคลภายนอก ยกเว้น:
            (1) Supabase ในฐานะผู้ประมวลผลข้อมูล
            (2) Resend สำหรับการส่งอีเมลแจ้งเตือน (เฉพาะอีเมลปลายทาง)
            (3) กรณีที่กฎหมายกำหนดหรือมีคำสั่งศาล
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>6. ติดต่อเจ้าหน้าที่คุ้มครองข้อมูล</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            หากต้องการใช้สิทธิ์หรือมีข้อสงสัย กรุณาติดต่อผู้ดูแลระบบผ่านหน้าตั้งค่า
            เราจะตอบกลับภายใน 30 วัน
          </p>
        </section>
      </div>
    </div>
  )
}
