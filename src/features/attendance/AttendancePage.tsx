import { useTranslation } from 'react-i18next'
import { useViewScope } from '../../context/ViewScopeContext'
import { TutorAttendanceView } from './TutorAttendanceView'
import { FamilyAttendanceView } from './FamilyAttendanceView'

export function AttendancePage() {
  const { t } = useTranslation()
  const { scope } = useViewScope()

  // Which shape renders is the scope, not the role column (ADR-025).
  // The two things that were true before this change are still true:
  //
  //   - an admin takes the *class* shape. `isAdmin` grants that scope
  //     directly, and `useMyClasses` returns every class for an admin,
  //     which is where its own admin branch comes from (ADR-019) — an
  //     admin is normally in no class's `tutor_ids` and the tutor query
  //     alone would leave them with an empty picker.
  //   - the family shape is the wrong *job* for an admin, and that is
  //     the only reason left to keep them out of it by default. It used
  //     to be a safety measure too: `FamilyAttendanceView`'s "my
  //     children" query ran unfiltered and `students_admin_all` has no
  //     `parent_id` predicate, so it would have returned every student
  //     in the school — a ChildPicker listing ~200 children as the
  //     admin's own. ADR-019 closed that at the query (`useMyStudents`
  //     filters on `parent_id`/`user_id` explicitly), so an admin who
  //     reaches this view sees only their own children, or none.
  //
  // What changes is that an admin whose own child is enrolled — like
  // Ustadzah Laila in the dev fixture — is no longer *fenced out* of the
  // family shape by a role label. She holds the family relationship, the
  // switch offers it, and what she gets is her own daughter and nobody
  // else, because the query asks about `parent_id` and RLS answers the
  // same way. Routing has not stood between an admin and the whole
  // school since ADR-019, so there is nothing left for it to protect.
  const isClassScope = scope === 'class'

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-ppme-primary">
        {t(isClassScope ? 'attendance.title' : 'attendance.myTitle')}
      </h1>
      {isClassScope ? <TutorAttendanceView /> : <FamilyAttendanceView />}
    </div>
  )
}
