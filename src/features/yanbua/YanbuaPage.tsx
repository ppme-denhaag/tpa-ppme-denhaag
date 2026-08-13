import { useAuth } from '../../context/AuthContext'
import { TutorYanbuaView } from './TutorYanbuaView'
import { FamilyYanbuaView } from './FamilyYanbuaView'

// Unlike AttendancePage, the heading lives inside each view rather than
// here: the family view's title depends on whether the viewer is a parent
// (yanbua.childTitle, needs the selected child's name) or a 16+ student
// (yanbua.myTitle) — that distinction isn't known until a child is picked.
//
// Admin gets the tutor view (ADR-014): the class-picker shape works
// unchanged for it because `useMyClasses` already returns every class for
// admin, whereas `FamilyYanbuaView`'s "my children" query would return
// every student in the TPA (`students_admin_all` has no `parent_id`
// predicate). Recorded rows carry the admin's own id in `tutor_id` —
// see AttendancePage/TutorYanbuaView.
export function YanbuaPage() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'tutor' || profile?.role === 'admin'
  return isManager ? <TutorYanbuaView /> : <FamilyYanbuaView />
}
