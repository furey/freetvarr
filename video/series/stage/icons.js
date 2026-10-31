const stroke = (body, size = 120, w = 5) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

export const ICONS = {
  aerial: (s) => stroke(`
    <path d="M60 100 V40"/>
    <path d="M60 40 L28 20"/><path d="M60 40 L92 20"/>
    <path d="M60 56 L36 42"/><path d="M60 56 L84 42"/>
    <path d="M60 72 L44 62"/><path d="M60 72 L76 62"/>
    <path d="M44 100 H76"/>`, s),
  tuner: (s) => stroke(`
    <rect x="18" y="38" width="84" height="48" rx="10"/>
    <circle cx="36" cy="62" r="3.5" fill="currentColor"/>
    <circle cx="50" cy="62" r="3.5" fill="currentColor"/>
    <circle cx="64" cy="62" r="3.5" fill="currentColor"/>
    <circle cx="78" cy="62" r="3.5" fill="currentColor"/>
    <path d="M40 86 V96"/><path d="M80 86 V96"/>`, s),
  computer: (s) => stroke(`
    <rect x="30" y="18" width="60" height="84" rx="10"/>
    <rect x="40" y="30" width="40" height="16" rx="4"/>
    <rect x="40" y="52" width="40" height="16" rx="4"/>
    <circle cx="60" cy="86" r="4" fill="currentColor"/>`, s),
  tv: (s) => stroke(`
    <rect x="12" y="22" width="96" height="62" rx="8"/>
    <path d="M44 100 H76"/><path d="M60 84 V100"/>`, s),
  phone: (s) => stroke(`<rect x="38" y="14" width="44" height="92" rx="10"/><path d="M54 96 H66"/>`, s),
  check: (s) => stroke(`<path d="M28 62 L50 84 L92 38"/>`, s, 9),
  cross: (s) => stroke(`<path d="M34 34 L86 86"/><path d="M86 34 L34 86"/>`, s, 9),
  folder: (s) => stroke(`<path d="M14 34 a8 8 0 0 1 8 -8 H48 L58 38 H98 a8 8 0 0 1 8 8 V90 a8 8 0 0 1 -8 8 H22 a8 8 0 0 1 -8 -8 Z"/>`, s),
  file: (s) => stroke(`<path d="M30 14 H70 L92 36 V106 H30 Z"/><path d="M70 14 V36 H92"/><path d="M50 62 L70 74 L50 86 Z" fill="currentColor"/>`, s),
  play: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 120 120"><path d="M40 26 L96 60 L40 94 Z" fill="currentColor"/></svg>`,
  pause: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 120 120"><rect x="32" y="24" width="20" height="72" rx="5" fill="currentColor"/><rect x="68" y="24" width="20" height="72" rx="5" fill="currentColor"/></svg>`,
  back: (s) => stroke(`<path d="M40 30 a38 38 0 1 1 -12 40"/><path d="M26 24 V44 H46"/><text x="60" y="72" font-size="30" font-family="Figtree" font-weight="800" text-anchor="middle" fill="currentColor" stroke="none">10</text>`, s, 7),
  forward: (s) => stroke(`<path d="M80 30 a38 38 0 1 0 12 40"/><path d="M94 24 V44 H74"/><text x="60" y="72" font-size="30" font-family="Figtree" font-weight="800" text-anchor="middle" fill="currentColor" stroke="none">30</text>`, s, 7),
  calendar: (s) => stroke(`<rect x="16" y="24" width="88" height="80" rx="10"/><path d="M16 46 H104"/><path d="M40 14 V32"/><path d="M80 14 V32"/>`, s),
  lock: (s) => stroke(`<rect x="26" y="52" width="68" height="52" rx="10"/><path d="M40 52 V38 a20 20 0 0 1 40 0 V52"/>`, s),
  record: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 120 120"><circle cx="60" cy="60" r="34" fill="currentColor"/></svg>`,
}
