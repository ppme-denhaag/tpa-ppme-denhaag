import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLE_I18N_KEY } from '../lib/roleLabels'
import { ADMIN_NAV_TABS, NAV_TABS } from '../components/tabs'

export function Dashboard() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-ppme-primary">
          {profile?.full_name ?? profile?.email}
        </h1>
        {profile?.role && (
          <p className="mt-1 text-sm text-ppme-text/70">{t(ROLE_I18N_KEY[profile.role])}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {isAdmin ? (
          ADMIN_NAV_TABS.map(({ to, key }) => (
            <Link
              key={to}
              to={to}
              className="min-h-11 rounded-lg bg-white p-4 text-center font-medium text-ppme-text shadow-sm transition-colors hover:bg-ppme-bg-alt"
            >
              {t(key)}
            </Link>
          ))
        ) : (
          <>
            {NAV_TABS.map(({ to, key }) => (
              <Link
                key={to}
                to={to}
                className="min-h-11 rounded-lg bg-white p-4 text-center font-medium text-ppme-text shadow-sm transition-colors hover:bg-ppme-bg-alt"
              >
                {t(key)}
              </Link>
            ))}
            <Link
              to="/reports"
              className="min-h-11 rounded-lg bg-white p-4 text-center font-medium text-ppme-text shadow-sm transition-colors hover:bg-ppme-bg-alt"
            >
              {t('nav.laporan')}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
