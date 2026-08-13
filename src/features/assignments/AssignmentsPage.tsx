import { useAuth } from '../../context/AuthContext'
import { TutorAssignmentsView } from './TutorAssignmentsView'
import { FamilyAssignmentsView } from './FamilyAssignmentsView'

// Same shape as YanbuaPage: the heading lives inside each view rather
// than here, since the family view's title depends on whether the
// viewer is a parent (assignments.childTitle, needs the selected
// child's name) or a 16+ student (assignments.myTitle) — not known
// until a child is picked.
//
// Admin gets the tutor view (ADR-014) — same reasoning as
// AttendancePage/YanbuaPage: the class-picker shape needs no new query
// for admin, while FamilyAssignmentsView's "my children" query would
// return every student in the TPA (`students_admin_all` has no
// `parent_id` predicate).
export function AssignmentsPage() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'tutor' || profile?.role === 'admin'
  return isManager ? <TutorAssignmentsView /> : <FamilyAssignmentsView />
}
