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
  //     returns every class for an admin, which is where its own
  //     admin branch comes from (ADR-019) — an admin is normally in no
  //     class's `tutor_ids`, so the tutor query alone would leave them
  //     with an empty picker.
  //   - the family shape is the wrong *job* for an admin, which is now
  //     the only reason left to route away from it. It used to be a
  //     safety measure too: `FamilyAttendanceView`'s "my children" query
  //     ran unfiltered and `students_admin_all` has no `parent_id`
  //     predicate, so it would have returned every student in the school
  //     — a ChildPicker listing ~200 children as the admin's own. ADR-019
  //     closed that at the query (`useMyStudents` now filters on
  //     `parent_id`/`user_id` explicitly), so an admin who reached this
  //     view would correctly see only their own children, or none.
  //     Routing is no longer what stands between an admin and the whole
  //     school.
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
