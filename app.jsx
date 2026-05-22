// Main app: pages + detail panel + edit/adjust modals
const { useState: uS, useMemo: uM, useEffect: uE, useRef: uR } = React;

// =================== STOCK LIST ===================
function StockTable({ rows, density, onOpen, selected, sortBy, sortDir, onSort, onAdjust, onEdit, onDelete }) {
  const sortIcon = (col) => col === sortBy ? <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span> : <span className="sort-arrow">▼</span>;
  const sortClass = (col) => `sortable ${col === sortBy ? 'sorted' : ''}`;

  return (
    <div className={`table-wrap ${density === 'compact' ? 'density-compact' : ''}`}>
      <div className="table-head-bar">
        <div className="title">รายการต้นไม้ทั้งหมด</div>
        <div className="count">{rows.length} รายการ</div>
        <div style={{ flex: 1 }}></div>
        <div className="count">เรียงโดย: {sortBy === 'received' ? 'วันที่รับเข้า' : sortBy === 'stock' ? 'จำนวน' : sortBy === 'price' ? 'ราคา' : 'ชื่อ'}</div>
      </div>
      <div className="table-scroll">
        <table className="list">
          <thead>
            <tr>
              <th className={sortClass('name')} onClick={() => onSort('name')}>ชื่อต้นไม้ {sortIcon('name')}</th>
              <th>SKU</th>
              <th>หมวดหมู่</th>
              <th className={`num ${sortClass('price')}`} onClick={() => onSort('price')} style={{textAlign:'right'}}>ราคา {sortIcon('price')}</th>
              <th className={`num ${sortClass('stock')}`} onClick={() => onSort('stock')} style={{textAlign:'right'}}>คงเหลือ {sortIcon('stock')}</th>
              <th>สถานะ</th>
              <th>ตำแหน่ง</th>
              <th className={sortClass('received')} onClick={() => onSort('received')}>รับเข้า {sortIcon('received')}</th>
              <th className="actions"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const s = statusOf(p);
              const since = daysSince(p.received);
              const sinceLabel = since === 0 ? 'วันนี้' : since === 1 ? 'เมื่อวาน' : `${since} วันก่อน`;
              return (
                <tr key={p.sku} aria-selected={selected === p.sku} onClick={() => onOpen(p.sku)}>
                  <td>
                    <div className="cell-product">
                      <Thumb plant={p} size={density === 'compact' ? 28 : 40} />
                      <div style={{ minWidth: 0 }}>
                        <div className="name">{p.name}</div>
                        <div className="sci">{p.sci}</div>
                      </div>
                    </div>
                  </td>
                  <td className="cell-sku">{p.sku}</td>
                  <td><CategoryChip cat={p.cat} /></td>
                  <td className="num"><span className="num">฿{formatBaht(p.price)}</span></td>
                  <td className="num"><StockBar plant={p} /></td>
                  <td><StatusBadge status={s} /></td>
                  <td><span className="cell-sku">{p.loc}</span></td>
                  <td>
                    <div style={{ fontSize: 12.5 }}>{formatDateTh(p.received)}</div>
                    <div className="cell-sku" style={{ fontSize: 11 }}>{sinceLabel}</div>
                  </td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button title="ปรับสต็อก" onClick={() => onAdjust(p.sku)}><I.Tune /></button>
                      <button title="แก้ไข" onClick={() => onEdit(p.sku)}><I.Edit /></button>
                      <button title="ลบ" onClick={() => onDelete(p.sku)}><I.Trash /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '48px 12px', color: 'var(--muted)' }}>ไม่พบรายการที่ตรงกับเงื่อนไข</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockGrid({ rows, onOpen }) {
  return (
    <div className="grid-view">
      {rows.map(p => {
        const s = statusOf(p);
        return (
          <article key={p.sku} className="card" onClick={() => onOpen(p.sku)}>
            <Thumb plant={p} size="full" radius={0} />
            <div className="card-body">
              <div className="card-name">{p.name}</div>
              <div className="card-sci">{p.sci}</div>
              <div className="card-row">
                <div className="card-price"><span className="baht">฿</span>{formatBaht(p.price)}</div>
                <StatusBadge status={s} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, fontSize: 11.5, color: 'var(--muted)', justifyContent: 'space-between' }}>
                <span className="mono">{p.sku}</span>
                <span>คงเหลือ <strong className="num" style={{ color: 'var(--ink)' }}>{p.stock}</strong></span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// =================== FILTER BAR ===================
function FilterBar({ q, setQ, cat, setCat, status, setStatus, view, setView, onAddNew, onExport }) {
  return (
    <div className="toolbar">
      <div className="toolbar-search">
        <I.Search className="search-icon" />
        <input placeholder="ค้นหาชื่อ, SKU, ชื่อวิทย์…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <button className="filter-chip" data-active={cat !== 'all'} onClick={() => {
        const list = ['all', ...CATEGORIES.map(c => c.id)];
        const idx = list.indexOf(cat);
        setCat(list[(idx + 1) % list.length]);
      }}>
        <I.Tag size={12} stroke={1.8} />
        <span>หมวดหมู่:</span>
        <span className="dim">{cat === 'all' ? 'ทั้งหมด' : CAT_BY_ID[cat].th}</span>
      </button>
      <button className="filter-chip" data-active={status !== 'all'} onClick={() => {
        const list = ['all', 'ok', 'low', 'out'];
        const idx = list.indexOf(status);
        setStatus(list[(idx + 1) % list.length]);
      }}>
        <I.Alert size={12} stroke={1.8} />
        <span>สถานะ:</span>
        <span className="dim">{status === 'all' ? 'ทั้งหมด' : status === 'ok' ? 'พร้อมจำหน่าย' : status === 'low' ? 'ใกล้หมด' : 'หมดสต็อก'}</span>
      </button>
      {(cat !== 'all' || status !== 'all') && (
        <button className="btn btn-ghost" style={{ height: 30, padding: '0 8px', color: 'var(--muted)', fontSize: 12 }} onClick={() => { setCat('all'); setStatus('all'); }}>
          ล้างฟิลเตอร์
        </button>
      )}
      <div className="toolbar-spacer"></div>
      <div className="seg" role="tablist" aria-label="โหมดมุมมอง">
        <button aria-pressed={view === 'table'} onClick={() => setView('table')}><I.Table size={13} stroke={1.7} />ตาราง</button>
        <button aria-pressed={view === 'grid'} onClick={() => setView('grid')}><I.Grid size={13} stroke={1.7} />การ์ด</button>
      </div>
      <button className="btn" onClick={onExport}><I.Download stroke={1.7} />ส่งออก CSV</button>
      <button className="btn btn-accent" onClick={onAddNew}><I.Plus stroke={2.2} />เพิ่มต้นไม้</button>
    </div>
  );
}

// =================== DETAIL PANEL ===================
function DetailPanel({ plant, onClose, onAdjust, onEdit }) {
  const movements = uM(() => movementsFor(plant.sku), [plant.sku]);
  const s = statusOf(plant);
  const margin = ((plant.price - plant.cost) / plant.price * 100).toFixed(0);

  uE(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="panel" role="dialog" aria-label="รายละเอียดต้นไม้">
        <div className="panel-header">
          <div className="panel-title">รายละเอียด · <span className="mono" style={{ color: 'var(--ink-2)' }}>{plant.sku}</span></div>
          <button className="icon-btn" title="QR Code" style={{ marginLeft: 'auto' }}><I.QR /></button>
          <button className="panel-close" onClick={onClose} title="ปิด (Esc)"><I.X /></button>
        </div>

        <div className="panel-body">
          <div className="detail-hero">
            <Thumb plant={plant} size={140} radius={10} />
            <div style={{ minWidth: 0 }}>
              <div className="detail-name">{plant.name}</div>
              <div className="detail-sci">{plant.sci}</div>
              <div className="detail-meta">
                <CategoryChip cat={plant.cat} />
                <StatusBadge status={s} />
                <span className="badge"><I.Map size={11} stroke={2} />ตำแหน่ง {plant.loc}</span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.015em' }}>฿{formatBaht(plant.price)}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>ต้นทุน ฿{formatBaht(plant.cost)} · กำไร {margin}%</span>
              </div>
            </div>
          </div>

          <div>
            <div className="section-h"><span>ข้อมูลสต็อก</span><div className="line"></div></div>
            <div className="kv">
              <div><span className="k">คงเหลือ</span><span className="v">{plant.stock} ต้น</span></div>
              <div><span className="k">จุดสั่งซื้อขั้นต่ำ</span><span className="v">{plant.min} ต้น</span></div>
              <div><span className="k">มูลค่าสต็อก</span><span className="v">฿{formatBaht(plant.stock * plant.cost)}</span></div>
              <div><span className="k">ขนาด</span><span className="v" style={{ fontSize: 13 }}>{plant.size}</span></div>
              <div><span className="k">ซัพพลายเออร์</span><span className="v" style={{ fontSize: 13 }}>{plant.supplier}</span></div>
              <div><span className="k">รับเข้าล่าสุด</span><span className="v" style={{ fontSize: 13 }}>{formatDateTh(plant.received)}</span></div>
            </div>
          </div>

          <div>
            <div className="section-h"><span>การดูแล</span><div className="line"></div></div>
            <div className="kv">
              <div><span className="k">แสง</span><span className="v" style={{ fontSize: 13 }}>{plant.light}</span></div>
              <div><span className="k">น้ำ</span><span className="v" style={{ fontSize: 13 }}>{plant.water}</span></div>
            </div>
          </div>

          <div>
            <div className="section-h"><span>ประวัติเคลื่อนไหวล่าสุด</span><div className="line"></div><span className="cell-sku">{movements.length} รายการ</span></div>
            {movements.length === 0 ? (
              <div style={{ padding: '20px 14px', color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }}>
                ยังไม่มีการเคลื่อนไหว
              </div>
            ) : (
              <div className="movement-list">
                {movements.map(m => (
                  <div key={m.id} className="movement-row">
                    <div className={`movement-glyph ${m.type}`}>{m.type === 'in' ? '+' : m.type === 'out' ? '−' : '~'}</div>
                    <div className="movement-meta">
                      <div className="movement-title">{m.note}</div>
                      <div className="movement-sub">{formatDateTh(m.date)} · {m.actor} · <span className="mono">{m.id}</span></div>
                    </div>
                    <div className={`movement-amt ${m.type}`}>
                      {m.type === 'out' ? '−' : m.type === 'in' ? '+' : ''}{Math.abs(m.qty)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel-footer">
          <button className="btn btn-ghost btn-danger" title="ลบรายการ"><I.Trash />ลบ</button>
          <div style={{ flex: 1 }}></div>
          <button className="btn" onClick={onEdit}><I.Edit />แก้ไขข้อมูล</button>
          <button className="btn btn-accent" onClick={() => onAdjust('in')}><I.Plus stroke={2.2} />ปรับสต็อก</button>
        </div>
      </aside>
    </>
  );
}

// =================== ADJUST MODAL ===================
function AdjustModal({ plant, onClose, onSubmit }) {
  const [mode, setMode] = uS('in');
  const [qty, setQty] = uS(5);
  const [note, setNote] = uS('');
  uE(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const newStock = mode === 'in' ? plant.stock + qty : Math.max(0, plant.stock - qty);
  const delta = mode === 'in' ? qty : -qty;

  return (
    <div className="modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="ปรับจำนวนสต็อก">
        <div className="modal-header">
          <div className="modal-title">ปรับจำนวนสต็อก</div>
          <div className="modal-sub">{plant.name} · <span className="mono">{plant.sku}</span></div>
        </div>
        <div className="modal-body">
          <div className="field">
            <span className="field-label">ประเภทรายการ</span>
            <div className="toggle-group">
              <button type="button" className="in" aria-pressed={mode === 'in'} onClick={() => setMode('in')}>
                <I.Plus size={13} stroke={2.2} />รับเข้า
              </button>
              <button type="button" className="out" aria-pressed={mode === 'out'} onClick={() => setMode('out')}>
                <I.Minus size={13} stroke={2.2} />ตัดออก
              </button>
              <button type="button" aria-pressed={mode === 'adj'} onClick={() => setMode('adj')}>
                <I.Tune size={13} stroke={1.8} />ปรับปรุง
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="จำนวน" required>
              <QtyStepper value={qty} onChange={setQty} />
            </Field>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ผลลัพธ์</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                  <span className="num" style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>{newStock}</span>
                  <span className="num" style={{ fontSize: 12, color: delta >= 0 ? 'var(--accent-ink)' : 'var(--danger-ink)' }}>
                    {delta >= 0 ? '+' : ''}{delta} จาก {plant.stock}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <Field label="หมายเหตุ" hint="เช่น รับเข้าจากซัพพลายเออร์, ขายให้ลูกค้า, ใบเหลือง/เสียหาย">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เพิ่มหมายเหตุ (ไม่บังคับ)" />
          </Field>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-accent" onClick={() => onSubmit({ mode, qty, note })}>
            <I.Check stroke={2.2} />บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

// =================== ADD/EDIT MODAL ===================
function EditModal({ plant, onClose, onSubmit, mode }) {
  const init = plant || { name: '', sci: '', cat: 'indoor', price: '', cost: '', stock: 0, min: 5, size: SIZES[1], loc: 'A-01', supplier: SUPPLIERS[0] };
  const [form, setForm] = uS(init);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  uE(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title">{mode === 'edit' ? 'แก้ไขข้อมูลต้นไม้' : 'เพิ่มต้นไม้ใหม่'}</div>
          <div className="modal-sub">{mode === 'edit' ? <span><span className="mono">{plant.sku}</span> · บันทึกการเปลี่ยนแปลงจะถูกเก็บประวัติไว้</span> : 'กรอกข้อมูลด้านล่างเพื่อเพิ่มรายการใหม่'}</div>
        </div>
        <div className="modal-body">
          <Field label="ชื่อต้นไม้ (ไทย)" required>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="เช่น มอนสเตอร่า ดิลิซิโอซ่า" />
          </Field>
          <Field label="ชื่อวิทยาศาสตร์">
            <input className="input" style={{ fontStyle: 'italic' }} value={form.sci} onChange={(e) => set('sci', e.target.value)} placeholder="Monstera deliciosa" />
          </Field>
          <div className="field-row">
            <Field label="หมวดหมู่" required>
              <select className="select" value={form.cat} onChange={(e) => set('cat', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.th} — {c.en}</option>)}
              </select>
            </Field>
            <Field label="ขนาด">
              <select className="select" value={form.size} onChange={(e) => set('size', e.target.value)}>
                {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div className="field-row">
            <Field label="ราคาขาย (฿)" required>
              <input className="input num" type="number" value={form.price} onChange={(e) => set('price', +e.target.value)} />
            </Field>
            <Field label="ต้นทุน (฿)">
              <input className="input num" type="number" value={form.cost} onChange={(e) => set('cost', +e.target.value)} />
            </Field>
          </div>
          <div className="field-row">
            <Field label="จำนวนคงเหลือ" required>
              <input className="input num" type="number" value={form.stock} onChange={(e) => set('stock', +e.target.value)} />
            </Field>
            <Field label="จุดสั่งซื้อขั้นต่ำ" hint="สต็อกต่ำกว่าจะแจ้งเตือน">
              <input className="input num" type="number" value={form.min} onChange={(e) => set('min', +e.target.value)} />
            </Field>
          </div>
          <div className="field-row">
            <Field label="ตำแหน่งในคลัง">
              <select className="select" value={form.loc} onChange={(e) => set('loc', e.target.value)}>
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="ซัพพลายเออร์">
              <select className="select" value={form.supplier} onChange={(e) => set('supplier', e.target.value)}>
                {SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-accent" onClick={() => onSubmit(form)}>
            <I.Check stroke={2.2} />{mode === 'edit' ? 'บันทึก' : 'เพิ่มรายการ'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =================== DASHBOARD PAGE ===================
function DashboardPage({ plants, movements, density, openPlant, setPage, showAlert = true, currentUser }) {
  const totalSku = plants.length;
  const totalStock = plants.reduce((s, p) => s + p.stock, 0);
  const totalValue = plants.reduce((s, p) => s + p.stock * p.cost, 0);
  const lowCount = plants.filter(p => statusOf(p) === 'low').length;
  const outCount = plants.filter(p => statusOf(p) === 'out').length;
  const movements7 = movements.slice(0, 5);
  const recentInbound = plants.slice().sort((a, b) => new Date(b.received) - new Date(a.received)).slice(0, 5);
  const topValue = plants.slice().sort((a, b) => (b.stock * b.cost) - (a.stock * a.cost)).slice(0, 5);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">สวัสดี{currentUser?.name || 'คุณสมใจ'} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· ภาพรวมวันนี้</span></h1>
          <div className="page-subtitle">วันพฤหัสบดี ที่ 21 พฤษภาคม 2569 · มีการเคลื่อนไหว {movements.length} รายการในสัปดาห์นี้</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn"><I.Download stroke={1.7} />ดาวน์โหลดรายงาน</button>
          <button className="btn btn-accent" onClick={() => setPage('stock')}><I.Plus stroke={2.2} />เพิ่มต้นไม้</button>
        </div>
      </div>

      {showAlert && (lowCount + outCount) > 0 && (
        <div className="alert-row">
          <span className="pill">{lowCount + outCount}</span>
          <div><strong>ต้องสั่งซื้อเพิ่ม</strong> · มีต้นไม้ {lowCount} รายการใกล้หมดสต็อก และ {outCount} รายการหมดสต็อก</div>
          <a onClick={() => setPage('low')}>ดูทั้งหมด →</a>
        </div>
      )}

      <div className="stats">
        <StatCard label="SKU ทั้งหมด" icon={I.Box} value={totalSku} unit="รายการ" delta="+3 สัปดาห์นี้" deltaDir="up" sparkSeed={1.2} sparkColor="var(--accent)" />
        <StatCard label="จำนวนต้นไม้รวม" icon={I.Leaf} value={formatBaht(totalStock)} unit="ต้น" delta="+128 สัปดาห์นี้" deltaDir="up" sparkSeed={2.3} sparkColor="var(--accent)" />
        <StatCard label="มูลค่าสต็อก" icon={I.Chart} value={`฿${formatBaht(Math.round(totalValue / 1000))}K`} delta="+4.2%" deltaDir="up" sparkSeed={3.7} sparkColor="var(--accent)" />
        <StatCard label="ใกล้หมด / หมดสต็อก" icon={I.Alert} value={lowCount + outCount} unit="รายการ" delta={`${lowCount} ใกล้หมด · ${outCount} หมด`} deltaDir="down" alert sparkSeed={4.1} sparkColor="var(--amber)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }} className="dash-cols">
        <section className="table-wrap">
          <div className="table-head-bar">
            <div className="title">เคลื่อนไหวล่าสุด</div>
            <div className="count">{movements.length} รายการ</div>
            <div style={{ flex: 1 }}></div>
            <button className="btn btn-ghost" style={{ height: 28, padding: '0 8px', fontSize: 12 }} onClick={() => setPage('movements')}>ดูทั้งหมด<I.Chevron size={12} /></button>
          </div>
          <div className="movement-list" style={{ border: 0, borderRadius: 0 }}>
            {movements7.map(m => {
              const p = plantBySku(m.sku);
              return (
                <div key={m.id} className="movement-row" style={{ cursor: 'pointer' }} onClick={() => openPlant(m.sku)}>
                  <div className={`movement-glyph ${m.type}`}>{m.type === 'in' ? '+' : m.type === 'out' ? '−' : '~'}</div>
                  <div className="movement-meta">
                    <div className="movement-title">{p?.name} <span className="cell-sku">· {m.note}</span></div>
                    <div className="movement-sub">{formatDateTh(m.date)} · {m.actor}</div>
                  </div>
                  <div className={`movement-amt ${m.type}`}>{m.type === 'out' ? '−' : m.type === 'in' ? '+' : ''}{Math.abs(m.qty)}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="table-wrap">
          <div className="table-head-bar">
            <div className="title">รับเข้าล่าสุด</div>
            <div style={{ flex: 1 }}></div>
            <div className="count">5 รายการ</div>
          </div>
          <div style={{ padding: 4 }}>
            {recentInbound.map(p => (
              <div key={p.sku} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 6, cursor: 'pointer' }}
                   onClick={() => openPlant(p.sku)}
                   onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
                   onMouseLeave={(e) => e.currentTarget.style.background = ''}
              >
                <Thumb plant={p} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</div>
                  <div className="cell-sku">{p.sci}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 13, fontWeight: 500 }}>+{p.stock} ต้น</div>
                  <div className="cell-sku">{formatDateTh(p.received)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="table-wrap">
        <div className="table-head-bar">
          <div className="title">มูลค่าสต็อกสูงสุด</div>
          <div style={{ flex: 1 }}></div>
          <div className="count">5 อันดับ</div>
        </div>
        <table className="list">
          <thead>
            <tr>
              <th>ต้นไม้</th>
              <th>หมวดหมู่</th>
              <th className="num" style={{textAlign:'right'}}>คงเหลือ</th>
              <th className="num" style={{textAlign:'right'}}>ต้นทุน/ต้น</th>
              <th className="num" style={{textAlign:'right'}}>มูลค่ารวม</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {topValue.map(p => (
              <tr key={p.sku} onClick={() => openPlant(p.sku)}>
                <td>
                  <div className="cell-product">
                    <Thumb plant={p} size={36} />
                    <div><div className="name">{p.name}</div><div className="sci">{p.sci}</div></div>
                  </div>
                </td>
                <td><CategoryChip cat={p.cat} /></td>
                <td className="num"><span className="num">{p.stock}</span></td>
                <td className="num"><span className="num">฿{formatBaht(p.cost)}</span></td>
                <td className="num"><strong className="num">฿{formatBaht(p.stock * p.cost)}</strong></td>
                <td><StatusBadge status={statusOf(p)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// =================== STOCK PAGE ===================
function StockPage({ plants, density, view, setView, openPlant, selected, onAdjust, onEdit, onDelete, onAddNew }) {
  const [q, setQ] = uS('');
  const [cat, setCat] = uS('all');
  const [status, setStatus] = uS('all');
  const [sortBy, setSortBy] = uS('received');
  const [sortDir, setSortDir] = uS('desc');

  const onSort = (col) => {
    if (col === sortBy) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir(col === 'received' || col === 'stock' || col === 'price' ? 'desc' : 'asc'); }
  };

  const rows = uM(() => {
    let r = plants.slice();
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter(p => p.name.toLowerCase().includes(t) || p.sci.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t));
    }
    if (cat !== 'all') r = r.filter(p => p.cat === cat);
    if (status !== 'all') r = r.filter(p => statusOf(p) === status);
    r.sort((a, b) => {
      let av, bv;
      if (sortBy === 'name') { av = a.name; bv = b.name; }
      else if (sortBy === 'price') { av = a.price; bv = b.price; }
      else if (sortBy === 'stock') { av = a.stock; bv = b.stock; }
      else { av = new Date(a.received).getTime(); bv = new Date(b.received).getTime(); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return r;
  }, [plants, q, cat, status, sortBy, sortDir]);

  const onExport = () => alert(`ส่งออก CSV — ${rows.length} รายการ\n(สาธิต)`);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">รายการสต็อก</h1>
          <div className="page-subtitle">จัดการต้นไม้ในร้าน · ค้นหา ฟิลเตอร์ ปรับสต็อก และดูประวัติได้ในจุดเดียว</div>
        </div>
      </div>
      <FilterBar q={q} setQ={setQ} cat={cat} setCat={setCat} status={status} setStatus={setStatus}
                 view={view} setView={setView} onAddNew={onAddNew} onExport={onExport} />
      {view === 'table' ? (
        <StockTable rows={rows} density={density} onOpen={openPlant} selected={selected}
                    sortBy={sortBy} sortDir={sortDir} onSort={onSort}
                    onAdjust={onAdjust} onEdit={onEdit} onDelete={onDelete} />
      ) : (
        <StockGrid rows={rows} onOpen={openPlant} />
      )}
    </div>
  );
}

// =================== LOW STOCK PAGE ===================
function LowStockPage({ plants, openPlant, onAdjust }) {
  const rows = plants.filter(p => statusOf(p) !== 'ok').sort((a, b) => {
    const sa = statusOf(a), sb = statusOf(b);
    if (sa !== sb) return sa === 'out' ? -1 : 1;
    return a.stock - b.stock;
  });
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">แจ้งเตือนสต็อก</h1>
          <div className="page-subtitle">รายการที่จำนวนต่ำกว่าจุดสั่งซื้อ หรือหมดสต็อกแล้ว · ควรสั่งซื้อเพิ่มในรอบถัดไป</div>
        </div>
        <button className="btn btn-accent"><I.Truck stroke={1.8} />สร้าง PO สำหรับรายการเหล่านี้</button>
      </div>
      <div className="table-wrap">
        <div className="table-head-bar">
          <div className="title">รายการที่ต้องดูแล</div>
          <div className="count">{rows.length} รายการ</div>
        </div>
        <table className="list">
          <thead>
            <tr>
              <th>ต้นไม้</th>
              <th>หมวดหมู่</th>
              <th className="num" style={{textAlign:'right'}}>คงเหลือ</th>
              <th className="num" style={{textAlign:'right'}}>ขั้นต่ำ</th>
              <th className="num" style={{textAlign:'right'}}>ควรสั่งเพิ่ม</th>
              <th>ซัพพลายเออร์</th>
              <th>สถานะ</th>
              <th className="actions"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const need = Math.max(0, p.min * 2 - p.stock);
              return (
                <tr key={p.sku} onClick={() => openPlant(p.sku)}>
                  <td>
                    <div className="cell-product">
                      <Thumb plant={p} size={36} />
                      <div><div className="name">{p.name}</div><div className="sci">{p.sci}</div></div>
                    </div>
                  </td>
                  <td><CategoryChip cat={p.cat} /></td>
                  <td className="num"><strong className="num" style={{ color: statusOf(p) === 'out' ? 'var(--danger-ink)' : 'var(--amber-ink)' }}>{p.stock}</strong></td>
                  <td className="num"><span className="num" style={{ color: 'var(--muted)' }}>{p.min}</span></td>
                  <td className="num"><span className="num" style={{ fontWeight: 600 }}>+{need}</span></td>
                  <td style={{ fontSize: 12.5 }}>{p.supplier}</td>
                  <td><StatusBadge status={statusOf(p)} /></td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={() => onAdjust(p.sku)}>
                      <I.Plus stroke={2.2} size={12} />รับเข้า
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}><I.Check size={20} style={{ marginRight: 8, color: 'var(--accent)', verticalAlign: 'middle' }} />ทุกรายการมีสต็อกเพียงพอ</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =================== MOVEMENTS PAGE ===================
function MovementsPage({ movements, openPlant }) {
  const [filter, setFilter] = uS('all');
  const rows = filter === 'all' ? movements : movements.filter(m => m.type === filter);
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">ประวัติเคลื่อนไหว</h1>
          <div className="page-subtitle">บันทึกการรับเข้า ตัดออก และปรับปรุงสต็อกทั้งหมด</div>
        </div>
        <button className="btn"><I.Download stroke={1.7} />ส่งออกประวัติ</button>
      </div>
      <div className="toolbar">
        <div className="seg">
          <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด</button>
          <button aria-pressed={filter === 'in'} onClick={() => setFilter('in')}><I.Plus size={12} stroke={2.2} />รับเข้า</button>
          <button aria-pressed={filter === 'out'} onClick={() => setFilter('out')}><I.Minus size={12} stroke={2.2} />ตัดออก</button>
          <button aria-pressed={filter === 'adj'} onClick={() => setFilter('adj')}><I.Tune size={12} stroke={1.8} />ปรับปรุง</button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th>เลขที่</th>
              <th>วันที่</th>
              <th>ประเภท</th>
              <th>ต้นไม้</th>
              <th>หมายเหตุ</th>
              <th>ผู้ทำรายการ</th>
              <th className="num" style={{textAlign:'right'}}>จำนวน</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(m => {
              const p = plantBySku(m.sku);
              const label = m.type === 'in' ? 'รับเข้า' : m.type === 'out' ? 'ตัดออก' : 'ปรับปรุง';
              const cls = m.type === 'in' ? 'badge--ok' : m.type === 'out' ? 'badge--out' : 'badge--info';
              return (
                <tr key={m.id} onClick={() => openPlant(m.sku)}>
                  <td className="cell-sku">{m.id}</td>
                  <td style={{ fontSize: 12.5 }}>{formatDateTh(m.date)}</td>
                  <td><span className={`badge ${cls}`}><span className="dot"></span>{label}</span></td>
                  <td>
                    <div className="cell-product">
                      <Thumb plant={p} size={28} />
                      <div><div className="name" style={{ fontSize: 13 }}>{p.name}</div><div className="sci" style={{ fontSize: 11 }}>{p.sku}</div></div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>{m.note}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--muted)' }}>{m.actor}</td>
                  <td className="num">
                    <strong className="num" style={{ color: m.type === 'in' ? 'var(--accent-ink)' : m.type === 'out' ? 'var(--danger-ink)' : 'var(--info-ink)' }}>
                      {m.type === 'out' ? '−' : m.type === 'in' ? '+' : (m.qty >= 0 ? '+' : '−')}{Math.abs(m.qty)}
                    </strong>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =================== PLACEHOLDER PAGES ===================
function PlaceholderPage({ title, subtitle }) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <div className="page-subtitle">{subtitle}</div>
        </div>
      </div>
      <div style={{
        border: '1px dashed var(--border-strong)',
        borderRadius: 12,
        padding: 60,
        textAlign: 'center',
        color: 'var(--muted)',
        background: 'var(--surface)',
        backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 14px, var(--surface-2) 14px 15px)'
      }}>
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, marginBottom: 6, letterSpacing: '0.04em' }}>SECTION PLACEHOLDER</div>
        <div style={{ fontSize: 15, color: 'var(--ink-2)', fontWeight: 500 }}>หน้านี้พร้อมสำหรับขั้นถัดไป</div>
      </div>
    </div>
  );
}

// =================== LOGIN PAGE ===================
function LoginPage({ onLogin }) {
  const [username, setUsername] = uS('');
  const [password, setPassword] = uS('');
  const [error, setError] = uS('');
  const [loading, setLoading] = uS(false);
  const [showPass, setShowPass] = uS(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(() => {
      const user = USERS.find(u => u.username === username.trim() && u.password === password);
      if (user) {
        onLogin(user);
      } else {
        setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        setLoading(false);
      }
    }, 400);
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'var(--accent)', color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'IBM Plex Mono', fontWeight: 700, fontSize: 18, letterSpacing: '0.04em',
            marginBottom: 14,
          }}>สส</div>
          <div style={{ fontFamily: 'IBM Plex Sans Thai', fontWeight: 700, fontSize: 22, color: 'var(--ink)', letterSpacing: '-0.01em' }}>สวนสมใจ</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>ระบบจัดการสต็อกต้นไม้</div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '28px 28px 24px',
          boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)', marginBottom: 20 }}>เข้าสู่ระบบ</div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label className="field" style={{ gap: 6 }}>
              <span className="field-label">ชื่อผู้ใช้</span>
              <input
                className="input"
                type="text"
                autoComplete="username"
                placeholder="กรอกชื่อผู้ใช้"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                disabled={loading}
                required
              />
            </label>
            <label className="field" style={{ gap: 6 }}>
              <span className="field-label">รหัสผ่าน</span>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="กรอกรหัสผ่าน"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  disabled={loading}
                  required
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                    color: 'var(--muted)', lineHeight: 1,
                  }}
                  tabIndex={-1}
                >
                  <I.Eye size={15} />
                </button>
              </div>
            </label>

            {error && (
              <div style={{
                background: 'var(--danger-soft)', border: '1px solid var(--danger)',
                borderRadius: 8, padding: '9px 12px',
                fontSize: 13, color: 'var(--danger-ink)', display: 'flex', alignItems: 'center', gap: 7,
              }}>
                <I.Alert size={14} stroke={2} />{error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-accent"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', height: 40, marginTop: 4, fontSize: 14 }}
            >
              {loading ? 'กำลังเข้าสู่ระบบ…' : <><I.Check stroke={2.2} />เข้าสู่ระบบ</>}
            </button>
          </form>
        </div>

        {/* Demo accounts hint */}
        <div style={{
          marginTop: 20, padding: '14px 16px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, fontSize: 12,
        }}>
          <div style={{ color: 'var(--muted)', marginBottom: 8, fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '0.06em' }}>DEMO ACCOUNTS</div>
          {USERS.map(u => (
            <div key={u.username} style={{ display: 'flex', gap: 8, marginBottom: 4, color: 'var(--ink-2)', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => { setUsername(u.username); setPassword(u.password); setError(''); }}
                style={{
                  fontFamily: 'IBM Plex Mono', fontSize: 11.5, color: 'var(--accent-ink)',
                  background: 'var(--accent-soft)', border: 'none', borderRadius: 4,
                  padding: '1px 6px', cursor: 'pointer',
                }}
              >{u.username}</button>
              <span style={{ color: 'var(--muted)' }}>·</span>
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11.5 }}>{u.password}</span>
              <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 2 }}>({u.role.split(' · ')[1]})</span>
            </div>
          ))}
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 6 }}>คลิกที่ชื่อผู้ใช้เพื่อกรอกอัตโนมัติ</div>
        </div>
      </div>
    </div>
  );
}

// =================== ROOT APP ===================
// Map accent color hex → data-accent key (CSS selectors use the key)
const ACCENT_OPTIONS = [
  { key: 'green',  color: '#5ea374', label: 'เขียว · Green' },
  { key: 'teal',   color: '#5b9eaf', label: 'ฟ้าครีม · Teal' },
  { key: 'indigo', color: '#7a83d6', label: 'คราม · Indigo' },
  { key: 'rose',   color: '#d77a82', label: 'ชมพู · Rose' },
];
const ACCENT_BY_COLOR = Object.fromEntries(ACCENT_OPTIONS.map(a => [a.color.toLowerCase(), a.key]));

function App({ currentUser, onLogout }) {
  const [page, setPage] = uS('stock');
  const [plants, setPlants] = uS(PLANTS);
  const [movements, setMovements] = uS(MOVEMENTS);
  const [selectedSku, setSelectedSku] = uS(null);
  const [adjustSku, setAdjustSku] = uS(null);
  const [editSku, setEditSku] = uS(null);
  const [addingNew, setAddingNew] = uS(false);
  const [topSearch, setTopSearch] = uS('');

  const [t, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "view": "table",
    "density": "comfortable",
    "theme": "light",
    "accent": "#5ea374",
    "showAlert": true
  }/*EDITMODE-END*/);
  const accentKey = ACCENT_BY_COLOR[t.accent?.toLowerCase()] || 'green';

  uE(() => {
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.accent = accentKey;
  }, [t.theme, accentKey]);

  const selectedPlant = plants.find(p => p.sku === selectedSku);
  const adjustPlant = plants.find(p => p.sku === adjustSku);
  const editPlant = plants.find(p => p.sku === editSku);

  const counts = {
    stock: plants.length,
    low: plants.filter(p => statusOf(p) !== 'ok').length,
  };

  const openPlant = (sku) => setSelectedSku(sku);
  const closePanel = () => setSelectedSku(null);

  const handleAdjustSubmit = ({ mode, qty, note }) => {
    const delta = mode === 'in' ? qty : mode === 'out' ? -qty : qty;
    setPlants(ps => ps.map(p => p.sku === adjustSku ? { ...p, stock: Math.max(0, p.stock + delta), received: mode === 'in' ? daysAgo(0) : p.received } : p));
    const idNum = parseInt(movements[0]?.id.split('-')[1] || '2841', 10) + 1;
    const m = {
      id: `MV-${idNum}`,
      sku: adjustSku,
      type: mode,
      qty: Math.abs(delta),
      date: daysAgo(0),
      note: note || (mode === 'in' ? 'รับเข้าเพิ่ม' : mode === 'out' ? 'ตัดออก' : 'ปรับปรุง'),
      actor: currentUser.name,
    };
    setMovements(ms => [m, ...ms]);
    setAdjustSku(null);
  };

  const handleEditSubmit = (form) => {
    setPlants(ps => ps.map(p => p.sku === editSku ? { ...p, ...form } : p));
    setEditSku(null);
  };
  const handleAddNew = (form) => {
    const idNum = parseInt(plants[0].sku.split('-')[1], 10) + Math.floor(Math.random() * 90) + 10;
    const sku = `PLT-${String(idNum).padStart(4, '0')}`;
    setPlants(ps => [{ ...form, sku, received: daysAgo(0), light: form.light || 'แสงรำไร', water: form.water || '2 ครั้ง/สัปดาห์' }, ...ps]);
    setAddingNew(false);
  };
  const handleDelete = (sku) => {
    if (confirm('ลบรายการนี้?')) setPlants(ps => ps.filter(p => p.sku !== sku));
  };

  const here = page === 'dashboard' ? 'แดชบอร์ด' : page === 'stock' ? 'รายการสต็อก' : page === 'low' ? 'แจ้งเตือนสต็อก' : page === 'movements' ? 'ประวัติเคลื่อนไหว' : page === 'categories' ? 'หมวดหมู่' : page === 'suppliers' ? 'ซัพพลายเออร์' : page === 'reports' ? 'รายงาน' : 'ตั้งค่า';

  return (
    <>
      <div className="app">
        <Sidebar page={page} setPage={setPage} counts={counts} currentUser={currentUser} onLogout={onLogout} />
        <main className="main">
          <Topbar here={here} onSearch={setTopSearch} searchValue={topSearch} />
          {page === 'dashboard' && <DashboardPage plants={plants} movements={movements} density={t.density} openPlant={openPlant} setPage={setPage} showAlert={t.showAlert} currentUser={currentUser} />}
          {page === 'stock' && (
            <StockPage
              plants={plants}
              density={t.density}
              view={t.view}
              setView={(v) => setTweak('view', v)}
              openPlant={openPlant}
              selected={selectedSku}
              onAdjust={setAdjustSku}
              onEdit={setEditSku}
              onDelete={handleDelete}
              onAddNew={() => setAddingNew(true)}
            />
          )}
          {page === 'low' && <LowStockPage plants={plants} openPlant={openPlant} onAdjust={setAdjustSku} />}
          {page === 'movements' && <MovementsPage movements={movements} openPlant={openPlant} />}
          {page === 'categories' && <PlaceholderPage title="หมวดหมู่" subtitle="จัดการกลุ่มต้นไม้ในร้าน — Indoor, Outdoor, ไม้ดอก, ฯลฯ" />}
          {page === 'suppliers' && <PlaceholderPage title="ซัพพลายเออร์" subtitle="ข้อมูลผู้ส่งและประวัติการรับเข้า" />}
          {page === 'reports' && <PlaceholderPage title="รายงาน" subtitle="ยอดขาย มูลค่าสต็อก ฟลกราฟตามเดือน" />}
          {page === 'settings' && <PlaceholderPage title="ตั้งค่า" subtitle="ผู้ใช้ บทบาท การแจ้งเตือน และข้อมูลร้าน" />}
        </main>
      </div>

      {selectedPlant && <DetailPanel plant={selectedPlant} onClose={closePanel} onAdjust={() => setAdjustSku(selectedPlant.sku)} onEdit={() => setEditSku(selectedPlant.sku)} />}
      {adjustPlant && <AdjustModal plant={adjustPlant} onClose={() => setAdjustSku(null)} onSubmit={handleAdjustSubmit} />}
      {editPlant && <EditModal plant={editPlant} mode="edit" onClose={() => setEditSku(null)} onSubmit={handleEditSubmit} />}
      {addingNew && <EditModal plant={null} mode="add" onClose={() => setAddingNew(false)} onSubmit={handleAddNew} />}

      <TweaksPanel>
        <TweakSection label="มุมมอง · View">
          <TweakRadio label="รูปแบบ" value={t.view} onChange={(v) => setTweak('view', v)}
            options={[{ value: 'table', label: 'ตาราง' }, { value: 'grid', label: 'การ์ด' }]} />
          <TweakRadio label="ความหนาแน่น" value={t.density} onChange={(v) => setTweak('density', v)}
            options={[{ value: 'comfortable', label: 'ปกติ' }, { value: 'compact', label: 'แน่น' }]} />
        </TweakSection>
        <TweakSection label="ธีม · Appearance">
          <TweakRadio label="โหมด" value={t.theme} onChange={(v) => setTweak('theme', v)}
            options={[{ value: 'light', label: 'สว่าง' }, { value: 'dark', label: 'มืด' }]} />
          <TweakColor label="สีเน้น"
            value={t.accent}
            options={ACCENT_OPTIONS.map(a => a.color)}
            onChange={(v) => setTweak('accent', v)} />
        </TweakSection>
        <TweakSection label="ทดลอง">
          <TweakToggle label="แบนเนอร์แจ้งเตือน" value={t.showAlert} onChange={(v) => setTweak('showAlert', v)} />
          <TweakButton label="รีเซ็ตข้อมูลตัวอย่าง" secondary onClick={() => { setPlants(PLANTS); setMovements(MOVEMENTS); }} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

function AuthWrapper() {
  const [currentUser, setCurrentUser] = uS(null);
  if (!currentUser) return <LoginPage onLogin={setCurrentUser} />;
  return <App currentUser={currentUser} onLogout={() => setCurrentUser(null)} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<AuthWrapper />);
