import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useMyClasses } from '../../hooks/useMyClasses'
import { ClassPicker } from '../../components/ClassPicker'
import { fetchClassRoster, type RosterStudent } from '../../lib/roster'
import { getErrorMessage } from '../../lib/errors'
import { fetchReportsForStudents, type YearEndReport } from './api'
import { ReportEditor } from './ReportEditor'
import { STATUS_BADGE_CLASS, STATUS_LABEL_KEY } from './grade'

/**
 * FR-002 — the tutor's review queue: every report belonging to a student
 * in the selected class, drafts included (drafts are visible to the
 * authoring tutor and admin only, `yer_tutor_rw` / RLS-15).
 *
 * Reports are never created here. Generation is a bulk, enrollment-wide
 * operation triggered by admin from `/admin/reports` (ADR-013), so an
 * empty list means "ask admin to generate this year's drafts", not "make
 * one yourself" — which is what the empty state says.
 */
export function TutorReportsView() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { classes, loading: classesLoading } = useMyClasses()

  const [classId, setClassId] = useState<string | null>(null)
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [reports, setReports] = useState<YearEndReport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0].id)
  }, [classes, classId])

  useEffect(() => {
    if (!classId) return
    let active = true
    setLoading(true)
    setError(null)
    setSelectedId(null)
    fetchClassRoster(classId)
      .then(async (students) => {
        const data = await fetchReportsForStudents(students.map((s) => s.id))
        if (!active) return
        setRoster(students)
        setReports(data)
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [classId])

  const nameById = new Map(roster.map((s) => [s.id, s.full_name]))
  const selected = reports.find((r) => r.id === selectedId) ?? null

  function handleSaved(saved: YearEndReport) {
    setReports((prev) => prev.map((r) => (r.id === saved.id ? saved : r)))
  }

  if (classesLoading) return <p className="text-ppme-text/60">{t('common.loading')}</p>
  if (classes.length === 0) return <p className="text-ppme-text/60">{t('common.noClassesAssigned')}</p>

  if (selected) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="min-h-11 text-sm font-medium text-ppme-primary"
        >
          ← {t('common.back')}
        </button>
        <ReportEditor
          report={selected}
          studentName={nameById.get(selected.student_id) ?? '—'}
          canEdit={selected.tutor_id === profile?.id}
          onSaved={handleSaved}
        />
      </div>
    )
  }

  const sorted = [...reports].sort((a, b) => {
    const byName = (nameById.get(a.student_id) ?? '').localeCompare(nameById.get(b.student_id) ?? '')
    return byName !== 0 ? byName : b.academic_year.localeCompare(a.academic_year)
  })

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-ppme-primary">{t('reports.title')}</h1>

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <ClassPicker classes={classes} value={classId} onChange={setClassId} />
      </div>

      {error && <p className="rounded-lg bg-ppme-danger/10 p-3 text-sm text-ppme-danger">{error}</p>}

      {loading ? (
        <p className="text-ppme-text/60">{t('common.loading')}</p>
      ) : sorted.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-center text-ppme-text/60 shadow-sm">
          {t('reports.noDraftsForClass')}
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((report) => (
            <li key={report.id}>
              <button
                type="button"
                onClick={() => setSelectedId(report.id)}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-white p-4 text-left shadow-sm hover:bg-ppme-bg-alt"
              >
                <span>
                  <span className="block font-medium text-ppme-text">
                    {nameById.get(report.student_id) ?? '—'}
                  </span>
                  <span className="block text-xs text-ppme-text/60">
                    {t('reports.academicYear', { year: report.academic_year })}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[report.status]}`}
                >
                  {t(STATUS_LABEL_KEY[report.status])}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
