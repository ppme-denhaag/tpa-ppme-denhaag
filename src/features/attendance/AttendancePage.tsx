import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { TutorAttendanceView } from './TutorAttendanceView'
import { FamilyAttendanceView } from './FamilyAttendanceView'

export function AttendancePage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const isManager = profile?.role === 'tutor' || profile?.role === 'admin'

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-ppme-primary">
        {t(isManager ? 'attendance.title' : 'attendance.myTitle')}
      </h1>
      {isManager ? <TutorAttendanceView /> : <FamilyAttendanceView />}
    </div>
  )
}
