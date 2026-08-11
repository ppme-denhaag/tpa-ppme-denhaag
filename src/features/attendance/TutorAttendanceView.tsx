import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useMyClasses } from '../../hooks/useMyClasses'
import { ClassPicker } from '../../components/ClassPicker'
import type { Database, TablesInsert } from '../../lib/database.types'
import {
  fetchAttendanceForSession,
  fetchClassRoster,
  getOrCreateTodaySession,
  submitAttendance,
  todayLocalDate,
  type RosterStudent,
} from './api'

type AttendanceStatus = Database['public']['Enums']['attendance_status']

const REASON_PRESET_KEYS = ['reasonSick', 'reasonPermission', 'reasonNoReason', 'reasonOther'] as const

interface RowState {
  status: AttendanceStatus
  reason: string
}

export function TutorAttendanceView() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const { classes, loading: classesLoading } = useMyClasses()

  const [classId, setClassId] = useState<string | null>(null)
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0].id)
  }, [classes, classId])

  useEffect(() => {
    if (!classId || !profile) return
    let active = true
    setLoading(true)
    setError(null)
    setSubmitted(false)

    async function load() {
      try {
        const [rosterData, session] = await Promise.all([
          fetchClassRoster(classId!),
          getOrCreateTodaySession(classId!, profile!.id),
        ])
        if (!active) return

        const existing = await fetchAttendanceForSession(session.id)
        if (!active) return

        const existingByStudent = new Map(existing.map((a) => [a.student_id, a]))
        const initialRows: Record<string, RowState> = {}
        for (const student of rosterData) {
          const record = existingByStudent.get(student.id)
          initialRows[student.id] = {
            status: record?.status ?? 'present',
            reason: record?.reason ?? '',
          }
        }

        setRoster(rosterData)
        setSessionId(session.id)
        setRows(initialRows)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [classId, profile])

  const todayLabel = useMemo(() => {
    const date = new Date(`${todayLocalDate()}T00:00:00`)
    return new Intl.DateTimeFormat(i18n.language === 'nl' ? 'nl-NL' : 'id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date)
  }, [i18n.language])

  function setStatus(studentId: string, status: AttendanceStatus) {
    setSubmitted(false)
    setRows((prev) => ({
      ...prev,
      [studentId]: { status, reason: status === 'absent' ? prev[studentId]?.reason ?? '' : '' },
    }))
  }

  function setReason(studentId: string, reason: string) {
    setSubmitted(false)
    setRows((prev) => ({ ...prev, [studentId]: { ...prev[studentId], reason } }))
  }

  async function handleSubmit() {
    if (!sessionId) return
    setSubmitting(true)
    setError(null)
    try {
      const payload: TablesInsert<'attendance'>[] = roster.map((student) => ({
        session_id: sessionId,
        student_id: student.id,
        status: rows[student.id]?.status ?? 'present',
        reason: rows[student.id]?.status === 'absent' ? rows[student.id]?.reason || null : null,
      }))
      await submitAttendance(payload)
      setSubmitted(true)
      setConfirming(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (classesLoading) {
    return <p className="text-ppme-text/60">{t('common.loading')}</p>
  }

  if (classes.length === 0) {
    return <p className="text-ppme-text/60">{t('common.noClassesAssigned')}</p>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <ClassPicker classes={classes} value={classId} onChange={setClassId} />
        <p className="mt-2 text-sm font-medium capitalize text-ppme-text/70">{todayLabel}</p>
      </div>

      {error && <p className="rounded-lg bg-ppme-danger/10 p-3 text-sm text-ppme-danger">{error}</p>}

      {loading ? (
        <p className="text-ppme-text/60">{t('common.loading')}</p>
      ) : roster.length === 0 ? (
        <p className="text-ppme-text/60">{t('common.noStudentsInClass')}</p>
      ) : (
        <div className="space-y-2">
          {roster.map((student) => {
            const row = rows[student.id] ?? { status: 'present', reason: '' }
            return (
              <div key={student.id} className="rounded-lg bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-ppme-text">{student.full_name}</span>
                  <div className="flex gap-1">
                    <StatusButton
                      active={row.status === 'present'}
                      color="success"
                      label={t('attendance.present')}
                      onClick={() => setStatus(student.id, 'present')}
                    />
                    <StatusButton
                      active={row.status === 'late'}
                      color="neutral"
                      label={t('attendance.late')}
                      onClick={() => setStatus(student.id, 'late')}
                    />
                    <StatusButton
                      active={row.status === 'absent'}
                      color="danger"
                      label={t('attendance.absent')}
                      onClick={() => setStatus(student.id, 'absent')}
                    />
                  </div>
                </div>

                {row.status === 'absent' && (
                  <div className="mt-3 space-y-2 border-t border-black/5 pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {REASON_PRESET_KEYS.map((key) => (
                        <button
                          key={key}
                          type="button"
                          className="min-h-11 rounded-full border border-black/10 px-3 text-xs font-medium text-ppme-text/70 hover:bg-ppme-bg-alt"
                          onClick={() =>
                            setReason(student.id, key === 'reasonOther' ? '' : t(`attendance.${key}`))
                          }
                        >
                          {t(`attendance.${key}`)}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      className="min-h-11 w-full rounded-lg border border-black/10 px-3 text-sm text-ppme-text"
                      placeholder={t('attendance.reason')}
                      value={row.reason}
                      onChange={(e) => setReason(student.id, e.target.value)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {roster.length > 0 && !loading && (
        <div className="space-y-2">
          {submitted && (
            <p className="rounded-lg bg-ppme-success/10 p-3 text-sm text-ppme-success">
              {t('attendance.submitted')}
            </p>
          )}
          {confirming ? (
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <p className="text-sm text-ppme-text">
                {t('attendance.confirmSubmit', { count: roster.length })}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleSubmit()}
                  className="min-h-11 flex-1 rounded-lg bg-ppme-primary px-4 font-semibold text-white disabled:opacity-60"
                >
                  {submitting ? t('common.loading') : t('common.confirm')}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setConfirming(false)}
                  className="min-h-11 flex-1 rounded-lg border border-black/10 px-4 font-semibold text-ppme-text"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="min-h-11 w-full rounded-lg bg-ppme-primary px-4 font-semibold text-white shadow-sm hover:bg-ppme-primary-dark"
            >
              {t('attendance.submit')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function StatusButton({
  active,
  color,
  label,
  onClick,
}: {
  active: boolean
  color: 'success' | 'danger' | 'neutral'
  label: string
  onClick: () => void
}) {
  const activeClasses =
    color === 'success'
      ? 'bg-ppme-success text-white'
      : color === 'danger'
        ? 'bg-ppme-danger text-white'
        : 'bg-ppme-text text-white'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-md px-3 text-xs font-semibold transition-colors ${
        active ? activeClasses : 'bg-ppme-bg-alt text-ppme-text/60 hover:bg-black/5'
      }`}
    >
      {label}
    </button>
  )
}
