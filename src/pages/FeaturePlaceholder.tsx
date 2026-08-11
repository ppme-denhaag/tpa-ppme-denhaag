import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { ROLE_I18N_KEY } from '../lib/roleLabels'

/**
 * Foundation-scope placeholder. The nav shell, role derivation, and RLS
 * wiring underneath this are real; the feature body itself lands in the
 * milestone that owns it (see PRD-PPME-TPA.md §5-6 and the checklist's
 * suggested build order).
 */
export function FeaturePlaceholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()
  const { profile } = useAuth()

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm">
      <h1 className="text-lg font-bold text-ppme-primary">{t(titleKey)}</h1>
      <p className="mt-2 text-sm text-ppme-text/70">
        {profile?.role ? t(ROLE_I18N_KEY[profile.role]) : null}
      </p>
      <p className="mt-4 text-ppme-text/60">Coming soon.</p>
    </div>
  )
}
