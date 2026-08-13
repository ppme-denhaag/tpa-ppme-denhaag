import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { NAV_TABS } from './tabs'

/**
 * Same five operational tabs as the mobile bottom nav, plus — for admin
 * only — a single "Kelola" entry into the enrollment section. Desktop
 * has the horizontal room the bottom nav doesn't, so this is where the
 * admin entry point can live as a tab rather than only as a dashboard
 * tile. `to="/admin"` (no `end`) so the tab stays highlighted across
 * every `/admin/*` sub-screen.
 */
export function DesktopTabs() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const tabs = profile?.role === 'admin' ? [...NAV_TABS, { to: '/admin', key: 'nav.kelola' }] : NAV_TABS

  return (
    <nav className="hidden gap-1 border-b border-black/5 bg-white px-4 sm:flex" aria-label={t('app.name')}>
      {tabs.map(({ to, key }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `min-h-11 border-b-2 px-3 py-3 text-sm font-medium ${
              isActive
                ? 'border-ppme-primary text-ppme-primary'
                : 'border-transparent text-ppme-text/60 hover:text-ppme-text'
            }`
          }
        >
          {t(key)}
        </NavLink>
      ))}
    </nav>
  )
}
