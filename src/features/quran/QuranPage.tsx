import { useAuth } from '../../context/AuthContext'
import { AdminRestricted } from '../../components/AdminRestricted'
import { TutorQuranView } from './TutorQuranView'
import { FamilyQuranView } from './FamilyQuranView'

// Same shape as YanbuaPage/AssignmentsPage: the heading lives inside
// each view rather than here, since the family view's title depends on
// whether the viewer is a parent (quran.childTitle, needs the selected
// child's name) or a 16+ student (quran.myTitle) — not known until a
// child is picked.
//
// Admin is deliberately routed to neither view — same reasoning as
// AttendancePage/YanbuaPage/AssignmentsPage: FamilyQuranView's "my
// children" query would return every student for admin
// (students_admin_all has no parent_id predicate), not just none. See
// AdminRestricted's docstring.
export function QuranPage() {
  const { profile } = useAuth()
  if (profile?.role === 'admin') return <AdminRestricted />

  const isManager = profile?.role === 'tutor'
  return isManager ? <TutorQuranView /> : <FamilyQuranView />
}
