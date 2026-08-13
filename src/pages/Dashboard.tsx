import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLE_I18N_KEY } from '../lib/roleLabels'
import { NAV_TABS } from '../components/tabs'

const TILE_CLASS =
  'min-h-11 rounded-lg bg-white p-4 text-center font-medium text-ppme-text shadow-sm transition-colors hover:bg-ppme-bg-alt'

/**
 * Every role gets the same operational tiles (the five feature tabs plus
 * Rapor) — including admin, which since ADR-014 is a super admin with
 * full read/write access to all of them rather than an enrollment-only
 * role fenced out of them.
 *
 * Admin additionally gets a "Kelola" tile: the single entry point into
 * the enrollment screens, which are still admin-only (`RequireAdmin`)
 * and no longer have top-level tabs of their own.
 */
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
        {NAV_TABS.map(({ to, key }) => (
          <Link key={to} to={to} className={TILE_CLASS}>
            {t(key)}
          </Link>
        ))}
        <Link to="/reports" className={TILE_CLASS}>
          {t('nav.laporan')}
        </Link>
      </div>

      {/* Every role, not only recipients: the settings screen also
          explains what a notification can contain, and a tutor or admin
          should be able to read that too (TAD ADR-015). */}
      <Link
        to="/settings/notifications"
        className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm transition-colors hover:bg-ppme-bg-alt"
      >
        <span className="font-medium text-ppme-text">{t('common.notifications')}</span>
        <span aria-hidden className="text-ppme-primary">
          →
        </span>
      </Link>

      {isAdmin && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-ppme-text/70">{t('nav.kelola')}</h2>
          <Link
            to="/admin"
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm transition-colors hover:bg-ppme-bg-alt"
          >
            <span>
              <span className="block font-medium text-ppme-text">{t('nav.kelola')}</span>
              <span className="block text-xs text-ppme-text/60">{t('admin.hubSubtitle')}</span>
            </span>
            <span aria-hidden className="text-ppme-primary">
              →
            </span>
          </Link>
        </div>
      )}
    </div>
  )
}
