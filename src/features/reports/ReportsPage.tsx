import { useAuth } from '../../context/AuthContext'
import { AdminRestricted } from '../../components/AdminRestricted'
import { TutorReportsView } from './TutorReportsView'
import { FamilyReportsView } from './FamilyReportsView'

/**
 * Same shape as QuranPage/MurajaahPage/YanbuaPage/AssignmentsPage: admin
 * gets neither view. Admin's only involvement with year-end reports is
 * triggering bulk draft generation from `/admin/reports`, which shows
 * counts and nothing else — never report content (ADR-012/ADR-013).
 */
export function ReportsPage() {
  const { profile } = useAuth()
  if (profile?.role === 'admin') return <AdminRestricted />

  return profile?.role === 'tutor' ? <TutorReportsView /> : <FamilyReportsView />
}
