import { useAuth } from '../../context/AuthContext'
import { AdminRestricted } from '../../components/AdminRestricted'
import { TutorMurajaahView } from './TutorMurajaahView'
import { FamilyMurajaahView } from './FamilyMurajaahView'

// Same shape as QuranPage/YanbuaPage/AssignmentsPage: admin is routed to
// neither view (FamilyMurajaahView's "my children" query would return
// every student for admin, not just none — see AdminRestricted's
// docstring), and the heading lives inside each view since the family
// view's title depends on the viewer's role (parent vs 16+ student).
export function MurajaahPage() {
  const { profile } = useAuth()
  if (profile?.role === 'admin') return <AdminRestricted />

  const isManager = profile?.role === 'tutor'
  return isManager ? <TutorMurajaahView /> : <FamilyMurajaahView />
}
