// Reusable presentational parts
const { useState, useMemo, useEffect, useRef } = React;

// --- SVG striped placeholder thumb (no hand-drawn imagery) ---
function Thumb({ plant, size = 40, className = '', radius }) {
  const cat = CAT_BY_ID[plant.cat];
  const hue = cat?.hue ?? 140;
  const r = radius ?? Math.max(4, size * 0.12);
  const stripeBg = `oklch(95% 0.035 ${hue})`;
  const stripeFg = `oklch(89% 0.045 ${hue})`;
  const ink = `oklch(38% 0.07 ${hue})`;
  return (
    <div
      className={`thumb thumb-big ${className}`}
      style={{
        width: size === 'full' ? '100%' : size,
        height: size === 'full' ? undefined : size,
        background: stripeBg,
        backgroundImage: `repeating-linear-gradient(135deg, transparent 0 6px, ${stripeFg} 6px 7px)`,
        borderRadius: r,
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'end stretch',
        color: ink,
      }}
      aria-hidden="true"
    >
      <div style={{
        padding: size >= 80 ? '6px 8px' : '3px 4px',
        fontFamily: 'IBM Plex Mono',
        fontSize: size >= 80 ? 10 : 8,
        letterSpacing: '0.02em',
        opacity: 0.75,
        textAlign: 'left',
        background: `linear-gradient(to top, ${stripeBg} 60%, transparent)`,
        lineHeight: 1.1,
      }}>
        {plant.sku}
      </div>
    </div>
  );
}

// --- Stock-bar component (numeric + visual fill) ---
function StockBar({ plant }) {
  const s = statusOf(plant);
  const target = Math.max(plant.min * 3, 20);
  const pct = Math.min(100, (plant.stock / target) * 100);
  return (
    <div className="stock-bar">
      <span className="num-cell">{plant.stock}</span>
      <div className="bar">
        <div
          className={`fill ${s === 'low' ? 'fill--low' : ''} ${s === 'out' ? 'fill--out' : ''}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

// --- Status badge ---
function StatusBadge({ status }) {
  const cls = status === 'out' ? 'badge--out' : status === 'low' ? 'badge--low' : 'badge--ok';
  return (
    <span className={`badge ${cls}`}>
      <span className="dot"></span>
      {statusLabel(status)}
    </span>
  );
}

// --- Category chip ---
function CategoryChip({ cat }) {
  const c = typeof cat === 'string' ? CAT_BY_ID[cat] : cat;
  if (!c) return null;
  return (
    <span className="badge" style={{ borderColor: 'transparent', background: `oklch(95% 0.03 ${c.hue})`, color: `oklch(35% 0.08 ${c.hue})` }}>
      {c.th}
    </span>
  );
}

// --- Sparkline svg (random-but-stable) ---
function Spark({ seed = 1, color = 'currentColor', up = true }) {
  const points = useMemo(() => {
    const r = (n) => (Math.sin(seed * 1000 + n * 7.3) + 1) / 2;
    const arr = Array.from({ length: 14 }, (_, i) => r(i));
    if (up) arr[arr.length - 1] = Math.max(...arr) * 0.95;
    return arr.map((v, i) => `${(i / 13) * 72},${28 - v * 24 - 2}`).join(' ');
  }, [seed, up]);
  return (
    <svg viewBox="0 0 72 28" className="stat-spark" preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" points={points} />
    </svg>
  );
}

// --- Sidebar ---
function Sidebar({ page, setPage, counts, currentUser, onLogout }) {
  const items = [
    { id: 'dashboard', label: 'แดชบอร์ด',   icon: I.Dashboard },
    { id: 'stock',     label: 'รายการสต็อก', icon: I.Box,     count: counts.stock },
    { id: 'low',       label: 'แจ้งเตือนสต็อก',icon: I.Alert,  count: counts.low, alert: true },
    { id: 'movements', label: 'ประวัติเคลื่อนไหว', icon: I.History },
    { id: 'categories',label: 'หมวดหมู่',    icon: I.Tag },
    { id: 'suppliers', label: 'ซัพพลายเออร์',  icon: I.Truck },
  ];
  const reports = [
    { id: 'reports',  label: 'รายงาน',     icon: I.Chart },
    { id: 'settings', label: 'ตั้งค่า',    icon: I.Gear },
  ];
  const user = currentUser || { name: 'คุณสมใจ', role: 'เจ้าของร้าน · Admin', initials: 'สม' };
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">สส</div>
        <div>
          <div className="brand-name">สวนสมใจ</div>
          <div className="brand-sub">STOCK · v2.4</div>
        </div>
      </div>
      <nav className="nav">
        <div className="nav-section-label">ทั่วไป</div>
        {items.map(item => (
          <button key={item.id} className="nav-item" aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}>
            <item.icon />
            <span>{item.label}</span>
            {item.count != null && (
              <span className="nav-count" style={item.alert && item.count > 0 ? { color: 'var(--amber-ink)' } : undefined}>
                {item.count}
              </span>
            )}
          </button>
        ))}
        <div className="nav-section-label">ระบบ</div>
        {reports.map(item => (
          <button key={item.id} className="nav-item" aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}>
            <item.icon />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer" style={{ flexDirection: 'column', gap: 0, padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <div className="avatar">{user.initials}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="user-name">{user.name}</div>
            <div className="user-role">{user.role}</div>
          </div>
          {onLogout && (
            <button
              title="ออกจากระบบ"
              onClick={onLogout}
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 6, padding: '4px 6px', cursor: 'pointer',
                color: 'var(--muted)', display: 'flex', alignItems: 'center',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger-ink)'; e.currentTarget.style.borderColor = 'var(--danger)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <I.LogOut size={13} stroke={1.8} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

// --- Topbar (breadcrumbs + search) ---
function Topbar({ here, onSearch, searchValue }) {
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>สวนสมใจ</span>
        <I.Chevron size={12} />
        <span className="here">{here}</span>
      </div>
      <div className="topbar-search">
        <I.Search className="search-icon" />
        <input
          placeholder="ค้นหาต้นไม้, SKU, ชื่อวิทย์…"
          value={searchValue}
          onChange={(e) => onSearch(e.target.value)}
        />
        <span className="kbd">⌘K</span>
      </div>
      <button className="icon-btn" title="การแจ้งเตือน">
        <I.Bell size={15} />
        <span className="dot"></span>
      </button>
      <button className="icon-btn" title="ปฏิทิน">
        <I.Calendar size={15} />
      </button>
    </header>
  );
}

// --- Stat card ---
function StatCard({ label, value, unit, delta, deltaDir = 'up', icon, alert, sparkSeed, sparkColor }) {
  const Ico = icon;
  return (
    <div className={`stat ${alert ? 'stat--alert' : ''}`}>
      <div className="stat-label">
        {Ico && <Ico />}
        <span>{label}</span>
      </div>
      <div className="stat-value">
        <span>{value}</span>
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {delta && (
        <div className={`stat-delta ${deltaDir}`}>
          {deltaDir === 'up' ? <I.ArrowU size={12} stroke={2.2} /> : <I.ArrowD size={12} stroke={2.2} />}
          {delta}
        </div>
      )}
      <Spark seed={sparkSeed ?? 1} color={sparkColor ?? 'var(--accent)'} up={deltaDir === 'up'} />
    </div>
  );
}

// --- Confirm helpers ---
function Field({ label, hint, required, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}{required && <span className="req">*</span>}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function QtyStepper({ value, onChange, min = 1, max = 999 }) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="qty-stepper">
      <button type="button" onClick={dec}>−</button>
      <input value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value || '0', 10) || 0)))} />
      <button type="button" onClick={inc}>+</button>
    </div>
  );
}

Object.assign(window, { Thumb, StockBar, StatusBadge, CategoryChip, Spark, Sidebar, Topbar, StatCard, Field, QtyStepper });
