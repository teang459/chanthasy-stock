// Tiny inline icon set — stroke-based, 16x16 viewbox
const Icon = ({ d, fill, size = 16, stroke = 1.6, ...rest }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill={fill || 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className="icon" {...rest}>
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);

const I = {
  Dashboard: (p) => <Icon d="M2.5 2.5h4v6h-4zM9.5 2.5h4v3h-4zM2.5 10h4v3.5h-4zM9.5 7h4v6.5h-4z" {...p} />,
  Box:       (p) => <Icon d="M8 1.8L13.5 4.5v7L8 14.2 2.5 11.5v-7zM2.5 4.5L8 7.2l5.5-2.7M8 7.2v7" {...p} />,
  Tag:       (p) => <Icon d={<><path d="M2 7V2h5l7 7-5 5z"/><circle cx="4.8" cy="4.8" r="0.8"/></>} {...p} />,
  Truck:     (p) => <Icon d={<><path d="M1.5 4h8v6h-8zM9.5 6.5h3l2 2v1.5h-5z"/><circle cx="4" cy="11.5" r="1.3"/><circle cx="11.5" cy="11.5" r="1.3"/></>} {...p} />,
  Bell:      (p) => <Icon d="M3.5 11.5h9M5 11.5V7.5a3 3 0 0 1 6 0v4M6.8 13.5a1.4 1.4 0 0 0 2.4 0" {...p} />,
  Chart:     (p) => <Icon d="M2 13.5V2.5M2 13.5h11.5M4.5 11V8M7 11V5.5M9.5 11V7M12 11V4" {...p} />,
  Gear:      (p) => <Icon d={<><circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></>} {...p} />,
  Search:    (p) => <Icon d={<><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2l3 3"/></>} {...p} />,
  Plus:      (p) => <Icon d="M8 3v10M3 8h10" {...p} />,
  Minus:     (p) => <Icon d="M3 8h10" {...p} />,
  X:         (p) => <Icon d="M3.5 3.5l9 9M12.5 3.5l-9 9" {...p} />,
  Filter:    (p) => <Icon d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5z" {...p} />,
  Sort:      (p) => <Icon d="M4 3v9.5M4 12.5l-2-2M4 12.5l2-2M12 13V3.5M12 3.5l-2 2M12 3.5l2 2" {...p} />,
  Download:  (p) => <Icon d="M8 2v8M4.5 7.5L8 11l3.5-3.5M2.5 13.5h11" {...p} />,
  Upload:    (p) => <Icon d="M8 11V3M4.5 6L8 2.5 11.5 6M2.5 13.5h11" {...p} />,
  Edit:      (p) => <Icon d="M11.5 2.5l2 2-8 8H3.5v-2z" {...p} />,
  Trash:     (p) => <Icon d="M2.5 4h11M5.5 4V2.5h5V4M4 4l.7 9h6.6L12 4M6.5 6.5v5M9.5 6.5v5" {...p} />,
  More:      (p) => <Icon d={<><circle cx="3.5" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r="1" fill="currentColor" stroke="none"/></>} {...p} />,
  Chevron:   (p) => <Icon d="M6 3.5L10.5 8 6 12.5" {...p} />,
  ChevronD:  (p) => <Icon d="M3.5 6L8 10.5 12.5 6" {...p} />,
  ChevronU:  (p) => <Icon d="M3.5 10L8 5.5 12.5 10" {...p} />,
  ArrowU:    (p) => <Icon d="M8 13V3M3.5 7.5L8 3l4.5 4.5" {...p} />,
  ArrowD:    (p) => <Icon d="M8 3v10M3.5 8.5L8 13l4.5-4.5" {...p} />,
  Eye:       (p) => <Icon d={<><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/></>} {...p} />,
  QR:        (p) => <Icon d="M2 2h4v4H2zM10 2h4v4h-4zM2 10h4v4H2zM10 10v1.5M10 13.5V14M12 10v2M13.5 11.5V14M11.5 13.5h2M8 2v3M8 7v2M8 11v3M3.5 8h2" {...p} />,
  Calendar:  (p) => <Icon d="M2.5 3.5h11v10h-11zM2.5 6h11M5.5 2v3M10.5 2v3M5 9h1M8 9h1M11 9h1M5 11h1M8 11h1" {...p} />,
  Leaf:      (p) => <Icon d="M2.5 13.5C2.5 7 7 2.5 13.5 2.5c0 6.5-4.5 11-11 11zM4 12L9 7" {...p} />,
  Alert:     (p) => <Icon d="M8 2.5L14 13H2zM8 6.5v3M8 11.2v0.3" {...p} />,
  Check:     (p) => <Icon d="M3 8.5L6.5 12l7-8" {...p} />,
  Map:       (p) => <Icon d="M2 4l4-1.5L10 4l4-1.5V12l-4 1.5L6 12l-4 1.5zM6 2.5v9.5M10 4v9.5" {...p} />,
  History:   (p) => <Icon d={<><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2.5 6"/><path d="M2.5 3v3h3"/><path d="M8 5v3l2 2"/></>} {...p} />,
  LogOut:    (p) => <Icon d={<><path d="M6 2.5H3a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h3M10.5 11l3-3-3-3M13.5 8H6"/></>} {...p} />,
  Tune:      (p) => <Icon d={<><path d="M3 4h10M3 8h10M3 12h10"/><circle cx="6" cy="4" r="1.4" fill="var(--surface)"/><circle cx="10" cy="8" r="1.4" fill="var(--surface)"/><circle cx="5" cy="12" r="1.4" fill="var(--surface)"/></>} {...p} />,
  Grid:      (p) => <Icon d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z" {...p} />,
  Table:     (p) => <Icon d="M2 3.5h12v9H2zM2 7h12M2 10h12M6 3.5v9M10 3.5v9" {...p} />,
};

window.I = I;
