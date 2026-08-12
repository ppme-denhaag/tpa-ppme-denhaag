import { useTranslation } from 'react-i18next'
import type { MurajaahLog } from './api'
import { QUALITY_BADGE_CLASS, QUALITY_LABEL_KEY } from './quality'

export function MurajaahTimeline({ entries }: { entries: MurajaahLog[] }) {
  const { t, i18n } = useTranslation()
  const dateFormatter = new Intl.DateTimeFormat(i18n.language === 'nl' ? 'nl-NL' : 'id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  if (entries.length === 0) return <p className="text-ppme-text/60">{t('common.empty')}</p>

  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-lg bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-ppme-text">
              {dateFormatter.format(new Date(`${entry.date}T00:00:00`))}
            </p>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${QUALITY_BADGE_CLASS[entry.quality]}`}
            >
              {t(QUALITY_LABEL_KEY[entry.quality])}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ppme-text/60">
            {entry.streak_count} {t('murajaah.streak')}
          </p>
        </li>
      ))}
    </ul>
  )
}
