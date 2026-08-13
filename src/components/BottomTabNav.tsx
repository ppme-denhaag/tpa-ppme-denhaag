import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { NAV_TABS } from './tabs'

/**
 * The five operational tabs, identical for every role including admin
 * (ADR-014). The enrollment screens are not here on purpose — 8 tabs
 * cannot share a mobile bottom nav at 44px tap targets, and the 5 below
 * are the prototype-validated set (checklist §5). Admin reaches
 * `/admin/*` through the "Kelola" tile on the dashboard or the extra
 * desktop tab.
 */
export function BottomTabNav() {
  const { t } = useTranslation()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-black/5 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
      aria-label={t('app.name')}
    >
      {NAV_TABS.map(({ to, key }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium ${
              isActive ? 'text-ppme-primary' : 'text-ppme-text/60'
            }`
          }
        >
          {t(key)}
        </NavLink>
      ))}
    </nav>
  )
}
