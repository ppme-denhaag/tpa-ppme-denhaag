import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { TutorAttendanceView } from './TutorAttendanceView'
import { FamilyAttendanceView } from './FamilyAttendanceView'

export function AttendancePage() {
  const { t } = useTranslation()
  const { profile } = useAuth()

  // Admin takes the *tutor* view, not the family one (ADR-014). Both
  // halves of that matter:
  //
  //   - tutor shape: class picker → roster → record. `useMyClasses`
  //     already returns every class for admin (`classes_read` has an
  //     `fn_is_admin()` branch), so this needs no admin-specific query.
  //   - never the family shape: `FamilyAttendanceView`'s "my children"
  //     query would return *every* student for admin, since
  //     `students_admin_all` has no `parent_id` predicate — a ChildPicker
  //     listing ~200 students as though they were the admin's own
  //     children.
  const isManager = profile?.role === 'tutor' || profile?.role === 'admin'

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-ppme-primary">
        {t(isManager ? 'attendance.title' : 'attendance.myTitle')}
      </h1>
      {isManager ? <TutorAttendanceView /> : <FamilyAttendanceView />}
    </div>
  )
}
