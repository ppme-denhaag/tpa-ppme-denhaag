import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ROLE_I18N_KEY } from '../../lib/roleLabels'
import type { AdminClass, DirectoryUser } from './api'

interface StudentFormProps {
  classes: AdminClass[]
  parents: DirectoryUser[]
  unlinkedAccounts: DirectoryUser[]
  saving: boolean
  onSave: (data: {
    full_name: string
    date_of_birth: string
    class_id: string | null
    parent_id: string
    user_id: string | null
  }) => void
}

const NONE = ''

export function StudentForm({ classes, parents, unlinkedAccounts, saving, onSave }: StudentFormProps) {
  const { t } = useTranslation()
  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [classId, setClassId] = useState(NONE)
  const [parentId, setParentId] = useState(NONE)
  const [userId, setUserId] = useState(NONE)

  const canSave = fullName.trim() && dob && parentId

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-ppme-text/70">
        {t('admin.fullName')}
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-black/10 px-3 text-sm text-ppme-text"
        />
      </label>

      <label className="block text-xs font-medium text-ppme-text/70">
        {t('admin.studentDob')}
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-black/10 px-3 text-sm text-ppme-text"
        />
      </label>

      <label className="block text-xs font-medium text-ppme-text/70">
        {t('admin.studentParent')}
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-black/10 px-3 text-sm text-ppme-text"
        >
          <option value={NONE} disabled>
            {parents.length === 0 ? t('admin.noParents') : '—'}
          </option>
          {/*
            The role is shown, not used to filter — the list already
            holds tutors and admins as well as parents (ADR-028), and an
            admin choosing between two people of the same name is better
            off seeing which one teaches. It is a label, not a boundary.
          */}
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {`${p.full_name} · ${t(ROLE_I18N_KEY[p.role])}`}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-ppme-text/70">
        {t('admin.studentClass')}
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-black/10 px-3 text-sm text-ppme-text"
        >
          <option value={NONE}>{classes.length === 0 ? t('admin.noClasses') : '—'}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {unlinkedAccounts.length > 0 && (
        <label className="block text-xs font-medium text-ppme-text/70">
          {t('admin.linkSelfLogin')}
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-black/10 px-3 text-sm text-ppme-text"
          >
            <option value={NONE}>{t('admin.linkSelfLoginNone')}</option>
            {unlinkedAccounts.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.email})
              </option>
            ))}
          </select>
        </label>
      )}

      <button
        type="button"
        disabled={saving || !canSave}
        onClick={() =>
          onSave({
            full_name: fullName.trim(),
            date_of_birth: dob,
            class_id: classId || null,
            parent_id: parentId,
            user_id: userId || null,
          })
        }
        className="min-h-11 w-full rounded-lg bg-ppme-primary px-4 font-semibold text-white shadow-sm hover:bg-ppme-primary-dark disabled:opacity-60"
      >
        {saving ? t('common.loading') : t('common.save')}
      </button>
    </div>
  )
}
