import { useAuth } from '../../context/AuthContext'
import { TutorQuranView } from './TutorQuranView'
import { FamilyQuranView } from './FamilyQuranView'

// Same shape as YanbuaPage/AssignmentsPage: the heading lives inside
// each view rather than here, since the family view's title depends on
// whether the viewer is a parent (quran.childTitle, needs the selected
// child's name) or a 16+ student (quran.myTitle) — not known until a
// child is picked.
//
// Admin gets the tutor view (ADR-014) — same reasoning as
// AttendancePage/YanbuaPage/AssignmentsPage: the class-picker shape
// works as-is for admin, while FamilyQuranView's "my children" query
// would return every student in the TPA (`students_admin_all` has no
// `parent_id` predicate).
export function QuranPage() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'tutor' || profile?.role === 'admin'
  return isManager ? <TutorQuranView /> : <FamilyQuranView />
}
