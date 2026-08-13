import { useAuth } from '../../context/AuthContext'
import { TutorReportsView } from './TutorReportsView'
import { FamilyReportsView } from './FamilyReportsView'

/**
 * Same shape as QuranPage/MurajaahPage/YanbuaPage/AssignmentsPage: admin
 * takes the staff (class-shaped) view, not the family one.
 *
 * Since ADR-014, admin sees every class's reports including drafts (RLS
 * already returned them — `yer_admin_all`), edits narratives and grades
 * like any other operational data, and downloads the PDFs. Publishing
 * stays with the authoring tutor; `TutorReportsView`/`ReportEditor`
 * carry that distinction. Bulk draft generation, previously a screen of
 * its own at `/admin/reports`, is now a panel inside this view.
 */
export function ReportsPage() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'tutor' || profile?.role === 'admin'
  return isManager ? <TutorReportsView /> : <FamilyReportsView />
}
