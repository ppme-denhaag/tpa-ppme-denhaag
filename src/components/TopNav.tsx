import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageToggle } from './LanguageToggle'
import { useAuth } from '../context/AuthContext'

export function TopNav() {
  const { t } = useTranslation()
  const { signOut } = useAuth()

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-ppme-primary px-4 text-white shadow-sm">
      <Link to="/" className="flex items-center gap-2 font-bold">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-ppme-primary"
        >
          {/* Placeholder mark — swap for the real PPME logo asset (see README). */}
          P
        </span>
        <span className="hidden sm:inline">{t('app.name')}</span>
      </Link>

      <div className="flex items-center gap-3">
        <Link
          to="/reports"
          className="hidden min-h-11 items-center rounded-md px-2 text-sm font-medium text-white/90 hover:text-white sm:flex"
        >
          {t('nav.laporan')}
        </Link>
        <LanguageToggle />
        <button
          type="button"
          onClick={() => void signOut()}
          className="min-h-11 rounded-md px-2 text-sm font-medium text-white/80 hover:text-white"
        >
          {t('auth.signOut')}
        </button>
      </div>
    </header>
  )
}
