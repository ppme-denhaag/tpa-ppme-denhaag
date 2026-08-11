import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { AdminRestricted } from '../../components/AdminRestricted'
import { TutorAttendanceView } from './TutorAttendanceView'
import { FamilyAttendanceView } from './FamilyAttendanceView'

export function AttendancePage() {
  const { t } = useTranslation()
  const { profile } = useAuth()

  // Admin is deliberately routed to neither view: TutorAttendanceView
  // shows operational data (attendance records) admin shouldn't browse,
  // and FamilyAttendanceView's "my children" query would actually return
  // *every* student for admin (students_admin_all has no parent_id
  // predicate) — worse, not better. See AdminRestricted's docstring.
  if (profile?.role === 'admin') return <AdminRestricted />

  const isManager = profile?.role === 'tutor'

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-ppme-primary">
        {t(isManager ? 'attendance.title' : 'attendance.myTitle')}
      </h1>
      {isManager ? <TutorAttendanceView /> : <FamilyAttendanceView />}
    </div>
  )
}
