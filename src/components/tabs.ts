// Confirmed order (PPME-TPA-Development-Checklist.md §5): Hadir | Tugas |
// Yanbu'a | Al-Quran | Murajaah. Do not reorder without re-validating
// against the Figma Make prototype.
export const NAV_TABS = [
  { to: '/attendance', key: 'nav.hadir' },
  { to: '/assignments', key: 'nav.tugas' },
  { to: '/yanbua', key: 'nav.yanbua' },
  { to: '/quran', key: 'nav.alquran' },
  { to: '/murajaah', key: 'nav.murajaah' },
] as const
