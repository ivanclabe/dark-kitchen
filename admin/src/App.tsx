import { ToastProvider } from '@/shared/ui/Toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, useEffect } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { LoginPage } from './auth/LoginPage'
import { AdminSessionProvider, useAdminSession } from './auth/session'
import { AdminLayout } from './layout/AdminLayout'
import { DashboardPage } from './pages/DashboardPage'
import { OrganizationsPage } from './pages/OrganizationsPage'

// Less-used sections load on demand (Administration carries the platform AI console).
const ActivityPage = lazy(() => import('./pages/ActivityPage').then((m) => ({ default: m.ActivityPage })))
const AdministrationPage = lazy(() => import('./pages/AdministrationPage').then((m) => ({ default: m.AdministrationPage })))
const AiMonitoringPage = lazy(() => import('./pages/AiMonitoringPage').then((m) => ({ default: m.AiMonitoringPage })))
const CreateOrganizationPage = lazy(() => import('./pages/CreateOrganizationPage').then((m) => ({ default: m.CreateOrganizationPage })))
const OrganizationDetailPage = lazy(() => import('./pages/OrganizationDetailPage').then((m) => ({ default: m.OrganizationDetailPage })))
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })))

// Its own cache: nothing is shared with Quanela, and nothing is kept per account.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })

const router = createBrowserRouter([
  {
    element: <AdminLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'organizations', element: <OrganizationsPage /> },
      { path: 'organizations/new', element: <CreateOrganizationPage /> },
      { path: 'organizations/:id', element: <OrganizationDetailPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'ai', element: <AiMonitoringPage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'administration', element: <AdministrationPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

/** Nothing of the portal renders until the database confirms role + second factor. */
function Gate() {
  const { stage } = useAdminSession()
  useEffect(() => {
    // Leaving the portal (or losing aal2) drops every cached answer.
    if (stage !== 'ready') queryClient.clear()
  }, [stage])

  if (stage === 'loading') return <div className="flex min-h-screen items-center justify-center bg-console-950 text-sm text-neutral-500">Cargando…</div>
  if (stage !== 'ready') return <LoginPage />
  return <RouterProvider router={router} />
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AdminSessionProvider>
          <Gate />
        </AdminSessionProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
