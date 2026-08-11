import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createStudent,
  fetchAllClasses,
  fetchAllStudents,
  fetchUnlinkedStudentAccounts,
  fetchUsersByRole,
  type AdminClass,
  type AdminStudent,
  type DirectoryUser,
} from './api'
import { StudentForm } from './StudentForm'

export function StudentsPage() {
  const { t } = useTranslation()
  const [students, setStudents] = useState<AdminStudent[]>([])
  const [classes, setClasses] = useState<AdminClass[]>([])
  const [parents, setParents] = useState<DirectoryUser[]>([])
  const [unlinked, setUnlinked] = useState<DirectoryUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)

  function load() {
    setLoading(true)
    setError(null)
    Promise.all([fetchAllStudents(), fetchAllClasses(), fetchUsersByRole('parent'), fetchUnlinkedStudentAccounts()])
      .then(([studentData, classData, parentData, unlinkedData]) => {
        setStudents(studentData)
        setClasses(classData)
        setParents(parentData)
        setUnlinked(unlinkedData)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleCreate(data: {
    full_name: string
    date_of_birth: string
    class_id: string | null
    parent_id: string
    user_id: string | null
  }) {
    setSaving(true)
    setError(null)
    try {
      await createStudent(data)
      setCreating(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-ppme-primary">{t('admin.studentsTitle')}</h1>

      {error && <p className="rounded-lg bg-ppme-danger/10 p-3 text-sm text-ppme-danger">{error}</p>}

      <div className="rounded-lg bg-white p-4 shadow-sm">
        {creating ? (
          <StudentForm
            classes={classes}
            parents={parents}
            unlinkedAccounts={unlinked}
            saving={saving}
            onSave={handleCreate}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="min-h-11 w-full rounded-lg border-2 border-dashed border-ppme-primary/30 px-4 font-semibold text-ppme-primary hover:bg-ppme-bg-alt"
          >
            + {t('admin.newStudent')}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-ppme-text/60">{t('common.loading')}</p>
      ) : students.length === 0 ? (
        <p className="text-ppme-text/60">{t('common.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {students.map((s) => (
            <li key={s.id} className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-ppme-text">{s.full_name}</p>
                {s.user_id && (
                  <span className="rounded-full bg-ppme-accent/15 px-2 py-0.5 text-xs font-semibold text-ppme-primary">
                    16+
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-ppme-text/60">
                {s.class?.name ?? '—'} · {s.parent?.full_name ?? '—'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
