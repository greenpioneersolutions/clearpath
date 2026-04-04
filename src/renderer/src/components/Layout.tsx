import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout(): JSX.Element {
  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--brand-page-bg)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
