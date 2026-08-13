import { useAuth } from '../../context/AuthContext'
import { TutorMurajaahView } from './TutorMurajaahView'
import { FamilyMurajaahView } from './FamilyMurajaahView'

// Same shape as QuranPage/YanbuaPage/AssignmentsPage: admin gets the
// tutor view (ADR-014) rather than the family one, whose "my children"
// query would return every student in the TPA for admin
// (`students_admin_all` has no `parent_id` predicate); the heading lives
// inside each view since the family view's title depends on the viewer's
// role (parent vs 16+ student).
//
// Note this is also where ADR-014's one deliberate exception lands:
// admin can set and deactivate Murajaah targets exactly like a tutor,
// but confirming *home practice* stays with parents. That falls out of
// the view split rather than needing a guard — the confirm control only
// exists in FamilyMurajaahView, gated on `role === 'parent'`, and
// `murajaah_log.confirmed_by` means "the parent who watched the child
// recite", which is not something an administrator can witness.
export function MurajaahPage() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'tutor' || profile?.role === 'admin'
  return isManager ? <TutorMurajaahView /> : <FamilyMurajaahView />
}
