import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useMyStudents } from '../../hooks/useMyStudents'
import { ChildPicker } from '../../components/ChildPicker'
import type { SurahRef } from '../../lib/quran'
import { getErrorMessage } from '../../lib/errors'
import { isStreakCurrent } from '../../lib/murajaah'
import type { Database } from '../../lib/database.types'
import {
  confirmPractice,
  fetchAllLogsForAssignments,
  fetchAssignmentsForStudent,
  todayLocalDate,
  type MurajaahAssignment,
  type MurajaahLog,
} from './api'
import { fetchSurahs } from '../quran/api'
import { AssignmentCard } from './AssignmentCard'
import { MurajaahTimeline } from './MurajaahTimeline'
import { QUALITY_LABEL_KEY, QUALITY_OPTIONS } from './quality'

type MurajaahQuality = Database['public']['Enums']['murajaah_quality']

export function FamilyMurajaahView() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const { students, loading: studentsLoading } = useMyStudents()

  const [studentId, setStudentId] = useState<string | null>(null)
  const [surahs, setSurahs] = useState<SurahRef[]>([])
  const [assignments, setAssignments] = useState<MurajaahAssignment[]>([])
  const [logs, setLogs] = useState<MurajaahLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quality, setQuality] = useState<MurajaahQuality>('hafal_lancar')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  useEffect(() => {
    fetchSurahs()
      .then(setSurahs)
      .catch((err) => setError(getErrorMessage(err)))
  }, [])

  useEffect(() => {
    if (!studentId && students.length > 0) setStudentId(students[0].id)
  }, [students, studentId])

  useEffect(() => {
    if (!studentId) return
    let active = true
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const assignmentData = await fetchAssignmentsForStudent(studentId!)
        if (!active) return
        setAssignments(assignmentData)
        const logData = await fetchAllLogsForAssignments(assignmentData.map((a) => a.id))
        if (!active) return
        setLogs(logData)
      } catch (err) {
        if (active) setError(getErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [studentId])

  const today = todayLocalDate()
  const activeAssignments = useMemo(() => assignments.filter((a) => a.active), [assignments])
  const memorizedAssignments = useMemo(() => assignments.filter((a) => !a.active), [assignments])
  const logsByAssignment = useMemo(() => {
    const map = new Map<string, MurajaahLog[]>()
    for (const log of logs) {
      const list = map.get(log.assignment_id) ?? []
      list.push(log)
      map.set(log.assignment_id, list)
    }
    return map
  }, [logs])

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === 'nl' ? 'nl-NL' : 'id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [i18n.language],
  )

  // Only parents can confirm home practice (RLS `mlog_parent_insert`
  // requires confirmed_by = auth.uid() AND the assignment's student to be
  // in fn_my_children(), which is parent_id-scoped) — a 16+ self-login
  // student viewing their own record has no write policy here, matching
  // the PRD's "parent confirms" design (the point is a parent verifying
  // practice happened at home, not self-report).
  const canConfirm = profile?.role === 'parent'

  async function handleConfirm(assignment: MurajaahAssignment) {
    if (!profile) return
    setConfirmingId(assignment.id)
    setError(null)
    try {
      const created = await confirmPractice({
        assignment_id: assignment.id,
        confirmed_by: profile.id,
        quality,
        date: today,
      })
      setLogs((prev) => [created, ...prev])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setConfirmingId(null)
    }
  }

  const selectedName = useMemo(
    () => students.find((s) => s.id === studentId)?.full_name,
    [students, studentId],
  )
  const title =
    profile?.role === 'parent' && selectedName
      ? t('murajaah.childTitle', { name: selectedName })
      : t('murajaah.myTitle')

  if (studentsLoading) return <p className="text-ppme-text/60">{t('common.loading')}</p>
  if (students.length === 0) return <p className="text-ppme-text/60">{t('common.empty')}</p>

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-ppme-primary">{title}</h1>

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <ChildPicker students={students} value={studentId} onChange={setStudentId} />
      </div>

      {error && <p className="rounded-lg bg-ppme-danger/10 p-3 text-sm text-ppme-danger">{error}</p>}

      {loading ? (
        <p className="text-ppme-text/60">{t('common.loading')}</p>
      ) : activeAssignments.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-center text-ppme-text/60 shadow-sm">
          {t('murajaah.noActiveTarget')}
        </p>
      ) : (
        <div className="space-y-3">
          {activeAssignments.map((assignment) => {
            const assignmentLogs = (logsByAssignment.get(assignment.id) ?? []).slice().sort((a, b) =>
              a.date < b.date ? 1 : -1,
            )
            const latest = assignmentLogs[0] ?? null
            const confirmedToday = isStreakCurrent(latest?.date ?? null, today)
            const bestStreak = assignmentLogs.reduce((max, l) => Math.max(max, l.streak_count), 0)

            return (
              <AssignmentCard key={assignment.id} assignment={assignment} surahs={surahs}>
                <div className="space-y-3">
                  {latest && (
                    <div>
                      <p className="text-2xl font-bold text-ppme-accent">
                        {latest.streak_count} {t('murajaah.streak')}
                      </p>
                      {confirmedToday ? (
                        <p className="text-xs text-ppme-text/50">{t('murajaah.streakEncourage')}</p>
                      ) : (
                        <p className="text-xs text-ppme-text/40">
                          {dateFormatter.format(new Date(`${latest.date}T00:00:00`))}
                        </p>
                      )}
                      {bestStreak > latest.streak_count && (
                        <p className="text-xs text-ppme-text/50">
                          {t('murajaah.bestStreak', { count: bestStreak })}
                        </p>
                      )}
                    </div>
                  )}

                  {confirmedToday ? (
                    <p className="rounded-lg bg-ppme-success/10 p-2 text-center text-sm font-semibold text-ppme-success">
                      {t('murajaah.confirmDone')}
                    </p>
                  ) : canConfirm ? (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-ppme-text/70">
                        {t('murajaah.fieldQuality')}
                        <select
                          value={quality}
                          onChange={(e) => setQuality(e.target.value as MurajaahQuality)}
                          className="mt-1 min-h-11 w-full rounded-lg border border-black/10 px-2 text-sm text-ppme-text"
                        >
                          {QUALITY_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {t(QUALITY_LABEL_KEY[opt])}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={confirmingId === assignment.id}
                        onClick={() => void handleConfirm(assignment)}
                        className="min-h-11 w-full rounded-lg bg-ppme-primary px-4 font-semibold text-white shadow-sm hover:bg-ppme-primary-dark disabled:opacity-60"
                      >
                        {confirmingId === assignment.id ? t('common.loading') : t('murajaah.confirmDone')}
                      </button>
                    </div>
                  ) : (
                    <p className="text-center text-sm text-ppme-text/60">{t('murajaah.notConfirmedToday')}</p>
                  )}
                </div>
              </AssignmentCard>
            )
          })}
        </div>
      )}

      {memorizedAssignments.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-ppme-text/70">{t('murajaah.portfolio')}</h2>
          <ul className="space-y-2">
            {memorizedAssignments.map((assignment) => {
              const surah = surahs.find((s) => s.surah_num === assignment.surah_num)
              return (
                <li
                  key={assignment.id}
                  className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm"
                >
                  <span className="text-sm font-medium text-ppme-text">
                    {surah?.transliteration ?? t('quran.surahNumber', { number: assignment.surah_num })} ·{' '}
                    {t('common.ayah')} {assignment.ayah_from}–{assignment.ayah_to}
                  </span>
                  <span className="rounded-full bg-ppme-accent/15 px-3 py-1 text-xs font-semibold text-ppme-primary">
                    {t('murajaah.memorized')}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ppme-text/70">{t('murajaah.history')}</h2>
        {loading ? (
          <p className="text-ppme-text/60">{t('common.loading')}</p>
        ) : (
          <MurajaahTimeline entries={logs.slice().sort((a, b) => (a.date < b.date ? 1 : -1))} />
        )}
      </div>
    </div>
  )
}
