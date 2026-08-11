import { useTranslation } from 'react-i18next'
import type { MyStudent } from '../hooks/useMyStudents'

interface ChildPickerProps {
  students: MyStudent[]
  value: string | null
  onChange: (studentId: string) => void
}

/** Select control for a parent with more than one linked child. */
export function ChildPicker({ students, value, onChange }: ChildPickerProps) {
  const { t } = useTranslation()

  if (students.length <= 1) return null

  return (
    <label className="block text-sm font-medium text-ppme-text">
      {t('common.selectChild')}
      <select
        className="mt-1 min-h-11 w-full rounded-lg border border-black/10 bg-white px-3 text-ppme-text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </select>
    </label>
  )
}
