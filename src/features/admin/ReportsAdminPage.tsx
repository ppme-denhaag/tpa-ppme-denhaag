import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentAcademicYear, isValidAcademicYear } from '../../lib/reports'
import { getErrorMessage } from '../../lib/errors'
import { generateDrafts, type GenerateDraftsResult } from '../reports/api'
import { fetchAllClasses, type AdminClass } from './api'

/**
 * FR-001's admin trigger — and deliberately nothing more.
 *
 * The TAD lists `generate-year-end-drafts` as "Admin-triggered", which
 * sits awkwardly next to ADR-012 (admin stays out of operational and
 * pedagogical data entirely). ADR-013 resolves it: bulk generation for a
 * whole academic year genuinely needs an enrollment-wide view, which
 * only admin has, so the *trigger* lives here — but this screen shows
 * only how many drafts were created and how many were skipped. It never
 * lists the drafts, never shows a narrative or a grade, and offers no
 * route to a report's content. Everything about what a report says stays
 * with the tutor who wrote it.
 */
export function ReportsAdminPage() {
  const { t } = useTranslation()
  const [academicYear, setAcademicYear] = useState(currentAcademicYear())
  const [classId, setClassId] = useState<string>('')
  const [classes, setClasses] = useState<AdminClass[]>([])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<GenerateDraftsResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAllClasses()
      .then(setClasses)
      .catch((err) => setError(getErrorMessage(err)))
  }, [])

  async function handleGenerate() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      setResult(await generateDrafts({ academic_year: academicYear, class_id: classId || null }))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  const yearValid = isValidAcademicYear(academicYear)

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-ppme-primary">{t('reports.generateDrafts')}</h1>

      <p className="rounded-lg bg-ppme-bg-alt p-3 text-sm text-ppme-text/70">
        {t('reports.adminScopeNote')}
      </p>

      {error && <p className="rounded-lg bg-ppme-danger/10 p-3 text-sm text-ppme-danger">{error}</p>}

      <div className="space-y-3 rounded-lg bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-ppme-text">
          {t('reports.academicYearLabel')}
          <input
            type="text"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="2025/2026"
            inputMode="numeric"
            className="mt-1 min-h-11 w-full rounded-lg border border-black/10 px-3 text-ppme-text"
          />
        </label>
        {!yearValid && <p className="text-xs text-ppme-danger">{t('reports.academicYearInvalid')}</p>}

        <label className="block text-sm font-medium text-ppme-text">
          {t('reports.classScope')}
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-black/10 bg-white px-3 text-ppme-text"
          >
            <option value="">{t('reports.allClasses')}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={running || !yearValid}
          className="min-h-11 w-full rounded-lg bg-ppme-primary px-4 font-semibold text-white shadow-sm hover:bg-ppme-primary-dark disabled:opacity-60"
        >
          {running ? t('common.loading') : t('reports.generateDraftsFor', { year: academicYear })}
        </button>
      </div>

      {result && (
        <div className="space-y-1 rounded-lg bg-white p-4 shadow-sm">
          <p className="font-semibold text-ppme-success">
            {t('reports.generatedCount', { count: result.created_count })}
          </p>
          <p className="text-sm text-ppme-text/70">
            {t('reports.skippedExisting', { count: result.skipped_existing })}
          </p>
          {result.skipped_no_tutor > 0 && (
            <p className="text-sm text-ppme-danger">
              {t('reports.skippedNoTutor', { count: result.skipped_no_tutor })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
