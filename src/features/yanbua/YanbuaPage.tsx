import { useAuth } from '../../context/AuthContext'
import { AdminRestricted } from '../../components/AdminRestricted'
import { TutorYanbuaView } from './TutorYanbuaView'
import { FamilyYanbuaView } from './FamilyYanbuaView'

// Unlike AttendancePage, the heading lives inside each view rather than
// here: the family view's title depends on whether the viewer is a parent
// (yanbua.childTitle, needs the selected child's name) or a 16+ student
// (yanbua.myTitle) — that distinction isn't known until a child is picked.
//
// Admin is deliberately routed to neither view — same reasoning as
// AttendancePage: FamilyYanbuaView's "my children" query would return
// every student for admin (students_admin_all has no parent_id
// predicate), not just none. See AdminRestricted's docstring.
export function YanbuaPage() {
  const { profile } = useAuth()
  if (profile?.role === 'admin') return <AdminRestricted />

  const isManager = profile?.role === 'tutor'
  return isManager ? <TutorYanbuaView /> : <FamilyYanbuaView />
}
