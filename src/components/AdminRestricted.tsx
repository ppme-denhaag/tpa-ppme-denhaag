import { useTranslation } from 'react-i18next'

/**
 * Shown instead of tutor/parent/student operational views when the
 * caller is an admin — admin's role is enrollment/setup (users, classes,
 * students), not viewing attendance/progress/homework data. This is an
 * application-layer restriction: RLS still grants admin full table
 * access (TAD's documented "Admin: ALL" policy, kept for legitimate
 * data-recovery/support needs), so this guard is what actually keeps
 * admin out of operational screens, including via direct URL.
 */
export function AdminRestricted() {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg bg-white p-6 text-center shadow-sm">
      <p className="font-semibold text-ppme-text">{t('admin.restrictedTitle')}</p>
      <p className="mt-2 text-sm text-ppme-text/60">{t('admin.restrictedMessage')}</p>
    </div>
  )
}
