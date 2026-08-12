import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SignIn } from './pages/SignIn'
import { Unauthorized } from './pages/Unauthorized'
import { Dashboard } from './pages/Dashboard'
import { FeaturePlaceholder } from './pages/FeaturePlaceholder'
import { AppLayout } from './routes/AppLayout'
import { AttendancePage } from './features/attendance/AttendancePage'
import { AssignmentsPage } from './features/assignments/AssignmentsPage'
import { YanbuaPage } from './features/yanbua/YanbuaPage'
import { RegistrationsPage } from './features/admin/RegistrationsPage'
import { ClassesPage } from './features/admin/ClassesPage'
import { StudentsPage } from './features/admin/StudentsPage'
import { RequireAdmin } from './components/RequireAdmin'

function Gate() {
  const { session, profile, loading, unregistered } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ppme-text/60">
        …
      </div>
    )
  }

  if (!session) return <SignIn />
  if (unregistered || !profile) return <Unauthorized />

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/assignments" element={<AssignmentsPage />} />
        <Route path="/yanbua" element={<YanbuaPage />} />
        <Route path="/quran" element={<FeaturePlaceholder titleKey="quran.title" />} />
        <Route path="/murajaah" element={<FeaturePlaceholder titleKey="murajaah.title" />} />
        <Route path="/reports" element={<FeaturePlaceholder titleKey="reports.title" />} />
        <Route
          path="/admin/registrations"
          element={
            <RequireAdmin>
              <RegistrationsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/classes"
          element={
            <RequireAdmin>
              <ClassesPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/students"
          element={
            <RequireAdmin>
              <StudentsPage />
            </RequireAdmin>
          }
        />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
