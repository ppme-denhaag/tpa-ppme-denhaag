import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getErrorMessage } from '../../lib/errors'
import { canReceiveNotifications } from '../../lib/notificationRoles'
import { ROLE_I18N_KEY } from '../../lib/roleLabels'
import {
  NOTIFICATION_ROUTE,
  copyKeyFor,
  copyValuesFor,
  type NotificationEventName,
} from '../../lib/notificationCopy'
import { fetchNotifications, markAllRead, type NotificationRow } from './api'

/**
 * The in-app notification centre — ADR-015 part 3.
 *
 * ── A note for whoever design-reviews this ──────────────────────────
 * This screen has **not** been through the prototype design review; PRD
 * §71 still lists it as an open follow-up, and it is the reason part 3
 * was held back after parts 1 and 2 shipped. It is built from the
 * card-list pattern the Murajaah and Quran timelines already use rather
 * than from a new idea, so that a review has something conventional to
 * react to.
 *
 * What a review can change freely: everything on this page. Grouping by
 * child, splitting read from unread, per-row dismissal, icons, relative
 * timestamps, filters. **None of that needs a migration** — the table
 * stores domain events and nothing about presentation (ADR-017), and
 * every sentence here is rendered at read time from `event` + `context`
 * against the i18n copy. That was the specific risk worth designing
 * around: a schema shaped like one particular list is a schema that has
 * to change when the list does.
 *
 * ── Read state ──────────────────────────────────────────────────────
 * Opening the page marks everything read, which is what makes the
 * badge honest: it counts what the family has not looked at, and they
 * have now looked. Rows stay on screen afterwards — this is a record of
 * what they were told, not an inbox to clear. The unread ones keep a
 * marker until the next load so the page does not visibly rewrite
 * itself under the reader.
 */
export function NotificationCentrePage() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()

  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isRecipient = profile ? canReceiveNotifications(profile.role) : false

  const dateFormatter = new Intl.DateTimeFormat(i18n.language === 'nl' ? 'nl-NL' : 'id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchNotifications()
      setRows(data)
      setError(null)
      // After rendering, not before: a family that never sees the list
      // because the request failed has not read anything.
      if (data.some((row) => row.read_at === null)) await markAllRead()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isRecipient) {
      setLoading(false)
      return
    }
    void load()
  }, [isRecipient, load])

  if (!isRecipient) {
    // Tutors and admin receive nothing (ADR-015(a)), and admin cannot
    // read anyone else's either (ADR-017) — so this is genuinely empty
    // rather than merely filtered, and says so.
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold text-ppme-primary">{t('notifications.title')}</h1>
        <p className="rounded-lg bg-white p-4 text-center text-ppme-text/60 shadow-sm">
          {t('notifications.settings.notARecipient', {
            // `ROLE_I18N_KEY`, not `roles.${role}` — the DB enum values
            // and the i18n keys deliberately do not match 1:1 (the copy
            // uses Ustadz/Orang Tua/Santri). Interpolating the enum
            // rendered the raw key on screen.
            role: t(ROLE_I18N_KEY[profile?.role ?? 'tutor']),
          })}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-ppme-primary">{t('notifications.title')}</h1>
        <Link
          to="/settings/notifications"
          className="min-h-11 rounded-md px-2 py-2 text-sm font-medium text-ppme-primary hover:underline"
        >
          {t('notifications.settings.title')}
        </Link>
      </div>

      {error && <p className="rounded-lg bg-ppme-danger/10 p-3 text-sm text-ppme-danger">{error}</p>}

      {loading ? (
        <p className="text-ppme-text/60">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-center text-ppme-text/60 shadow-sm">
          {t('notifications.empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const context = (row.context ?? {}) as Record<string, unknown>
            const childName = row.students?.full_name ?? ''
            return (
              <li
                key={row.id}
                // `ppme-bg-alt` is the page background, so an unread row
                // is tinted with the brand colour instead — on a white
                // card list, the page colour reads as a hole, not a
                // highlight.
                className={`rounded-lg p-3 shadow-sm ${
                  row.read_at === null ? 'bg-ppme-primary/5' : 'bg-white'
                }`}
              >
                <Link
                  to={NOTIFICATION_ROUTE[row.event as NotificationEventName] ?? '/'}
                  className="block"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-ppme-text">
                      {t(
                        copyKeyFor(row.event as NotificationEventName, context),
                        copyValuesFor(childName, context),
                      )}
                    </p>
                    {row.read_at === null && (
                      <span
                        aria-hidden
                        className="mt-1 h-2 w-2 shrink-0 rounded-full bg-ppme-primary"
                      />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ppme-text/50">
                    {dateFormatter.format(new Date(row.created_at))}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
