import { Outlet } from 'react-router-dom'
import { TopNav } from '../components/TopNav'
import { DesktopTabs } from '../components/DesktopTabs'
import { BottomTabNav } from '../components/BottomTabNav'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-ppme-bg-alt">
      <TopNav />
      <DesktopTabs />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:pb-6">
        <Outlet />
      </main>
      <BottomTabNav />
    </div>
  )
}
