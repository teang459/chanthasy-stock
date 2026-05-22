import React from 'react'

function Icon({ children, size = 16, stroke = 1.8, className = '', style, ...rest }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16"
      fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true" {...rest}
    >
      {children}
    </svg>
  )
}

export const Dashboard = p => <Icon {...p}><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></Icon>
export const Box       = p => <Icon {...p}><path d="M8 1.5 14 4.5v7L8 14.5 2 11.5v-7L8 1.5z"/><path d="M8 1.5v13M2 4.5l6 3 6-3"/></Icon>
export const Alert     = p => <Icon {...p}><path d="M8 2 14 13H2L8 2z"/><path d="M8 7v3M8 11.5v.5"/></Icon>
export const History   = p => <Icon {...p}><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2 2"/></Icon>
export const Tag       = p => <Icon {...p}><path d="M2 2h5l7 7-5 5-7-7V2z"/><circle cx="5" cy="5" r="1" fill="currentColor" stroke="none"/></Icon>
export const Truck     = p => <Icon {...p}><rect x="1" y="4" width="10" height="8" rx="1"/><path d="M11 6h2.5L15 9v3h-4V6z"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="13" r="1.5"/></Icon>
export const Chart     = p => <Icon {...p}><path d="M2 12V8M6 12V5M10 12V3M14 12V7"/><path d="M1 12h14"/></Icon>
export const Gear      = p => <Icon {...p}><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4"/></Icon>
export const Calendar  = p => <Icon {...p}><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M5 2v2M11 2v2M2 7h12"/></Icon>
export const Bell      = p => <Icon {...p}><path d="M6 13.5h4M8 2a4 4 0 0 1 4 4v4l1 1.5H3L4 10V6a4 4 0 0 1 4-4z"/></Icon>
export const Search    = p => <Icon {...p}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></Icon>
export const Chevron   = p => <Icon {...p}><path d="M6 4l4 4-4 4"/></Icon>
export const ChevronL  = p => <Icon {...p}><path d="M10 4L6 8l4 4"/></Icon>
export const ArrowU    = p => <Icon {...p}><path d="M8 13V4M4 8l4-4 4 4"/></Icon>
export const ArrowD    = p => <Icon {...p}><path d="M8 3v9M4 8l4 4 4-4"/></Icon>
export const LogOut    = p => <Icon {...p}><path d="M6 2.5H3a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h3M10.5 11l3-3-3-3M13.5 8H6"/></Icon>
export const Plus      = p => <Icon {...p}><path d="M8 3v10M3 8h10"/></Icon>
export const Minus     = p => <Icon {...p}><path d="M3 8h10"/></Icon>
export const Edit      = p => <Icon {...p}><path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5z"/></Icon>
export const Trash     = p => <Icon {...p}><path d="M3 5h10M8 8v4M6 5V4h4v1M5 5l.5 7h5L11 5"/></Icon>
export const X         = p => <Icon {...p}><path d="M12 4 4 12M4 4l8 8"/></Icon>
export const Check     = p => <Icon {...p}><path d="M3 8l4 4 6-7"/></Icon>
export const Warning   = p => <Icon {...p}><path d="M8 2 14 13H2L8 2z"/><path d="M8 6v4M8 11.5v.5"/></Icon>
export const Download  = p => <Icon {...p}><path d="M8 2v9M5 8l3 3 3-3M2 13h12"/></Icon>
export const Upload    = p => <Icon {...p}><path d="M8 11V2M5 5l3-3 3 3M2 13h12"/></Icon>
export const Adjust    = p => <Icon {...p}><path d="M4 8h8M10 5l3 3-3 3M6 5L3 8l3 3"/></Icon>
export const Eye       = p => <Icon {...p}><path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z"/><circle cx="8" cy="8" r="2"/></Icon>
export const EyeOff    = p => <Icon {...p}><path d="M2 2l12 12M6.5 6.7A3 3 0 0 0 8 11c1.66 0 3-1.34 3-3a3 3 0 0 0-.3-1.3M4 4.9C2.9 5.9 2 8 2 8s2.5 5 6 5a6.4 6.4 0 0 0 3.6-1.1"/><path d="M10.6 5.4A5.6 5.6 0 0 0 8 5C4.5 5 2 8 2 8s.7 1.4 2 2.7"/></Icon>
export const User      = p => <Icon {...p}><circle cx="8" cy="5.5" r="2.5"/><path d="M2.5 13.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/></Icon>
export const Menu      = p => <Icon {...p}><path d="M2 4h12M2 8h12M2 12h12"/></Icon>
export const Filter    = p => <Icon {...p}><path d="M2 4h12M5 8h6M7 12h2"/></Icon>
export const Refresh   = p => <Icon {...p}><path d="M13 4A6 6 0 1 0 14 8"/><path d="M14 2v4h-4"/></Icon>
export const Package   = p => <Icon {...p}><path d="M8 2L2 5v6l6 3 6-3V5L8 2zM2 5l6 3M8 8v6M14 5l-6 3"/></Icon>
export const Lock      = p => <Icon {...p}><rect x="4" y="7" width="8" height="7" rx="1"/><path d="M6 7V5a2 2 0 0 1 4 0v2"/><circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none"/></Icon>
export const Info      = p => <Icon {...p}><circle cx="8" cy="8" r="6"/><path d="M8 7v5M8 5.5v.5"/></Icon>
export const Wallet    = p => <Icon {...p}><path d="M2 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z"/><path d="M11 8.5h2M14 7v3"/></Icon>
export const TrendUp   = p => <Icon {...p}><path d="M2 11l4-4 3 3 5-6"/><path d="M10 4h4v4"/></Icon>
export const TrendDown = p => <Icon {...p}><path d="M2 5l4 4 3-3 5 6"/><path d="M10 12h4V8"/></Icon>
export const Coin      = p => <Icon {...p}><circle cx="8" cy="8" r="6"/><path d="M8 4v8M6 6h3.5a1.5 1.5 0 0 1 0 3H6h4a1.5 1.5 0 0 1 0 3H6"/></Icon>
