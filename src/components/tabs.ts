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

// Admin's nav is enrollment/setup only — never the operational tabs above
// (see AdminRestricted.tsx for why). Shown instead of NAV_TABS when
// profile.role === 'admin', never alongside it.
//
// `/admin/reports` is the one apparent exception and isn't really one:
// it triggers bulk draft generation across an academic year (an
// enrollment-wide operation) and shows only counts — never a report's
// narrative, grades, or even a list of which students got one. See
// ADR-013 in the TAD.
export const ADMIN_NAV_TABS = [
  { to: '/admin/registrations', key: 'nav.pendaftaran' },
  { to: '/admin/classes', key: 'nav.kelas' },
  { to: '/admin/students', key: 'nav.santri' },
  { to: '/admin/reports', key: 'nav.laporan' },
] as const
