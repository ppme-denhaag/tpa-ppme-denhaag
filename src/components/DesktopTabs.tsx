import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { ADMIN_NAV_TABS, NAV_TABS } from './tabs'

export function DesktopTabs() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const tabs = profile?.role === 'admin' ? ADMIN_NAV_TABS : NAV_TABS

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
