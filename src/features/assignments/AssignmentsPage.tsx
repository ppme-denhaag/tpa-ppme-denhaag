import { useAuth } from '../../context/AuthContext'
import { AdminRestricted } from '../../components/AdminRestricted'
import { TutorAssignmentsView } from './TutorAssignmentsView'
import { FamilyAssignmentsView } from './FamilyAssignmentsView'

// Same shape as YanbuaPage: the heading lives inside each view rather
// than here, since the family view's title depends on whether the
// viewer is a parent (assignments.childTitle, needs the selected
// child's name) or a 16+ student (assignments.myTitle) — not known
// until a child is picked.
//
// Admin is deliberately routed to neither view — same reasoning as
// AttendancePage/YanbuaPage: FamilyAssignmentsView's "my children"
// query would return every student for admin (students_admin_all has
// no parent_id predicate), not just none. See AdminRestricted's
// docstring.
export function AssignmentsPage() {
  const { profile } = useAuth()
  if (profile?.role === 'admin') return <AdminRestricted />

  const isManager = profile?.role === 'tutor'
  return isManager ? <TutorAssignmentsView /> : <FamilyAssignmentsView />
}
