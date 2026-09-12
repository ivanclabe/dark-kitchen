import { LoginPage } from '@/modules/auth/pages/LoginPage'
import { SignUpAdminPage } from '@/modules/auth/pages/SignUpAdminPage'
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage'
import { PlaceholderPage } from '@/shared/ui/PlaceholderPage'
import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { ProtectedRoute } from './ProtectedRoute'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup-admin', element: <SignUpAdminPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'orders', element: <PlaceholderPage title="Pedidos" phase="Fase 5" /> },
      { path: 'kitchen', element: <PlaceholderPage title="Cocina" phase="Fase 6" /> },
      { path: 'delivery', element: <PlaceholderPage title="Despachos" phase="Fase 7" /> },
      { path: 'inventory', element: <PlaceholderPage title="Inventario" phase="Fase 2" /> },
      { path: 'purchases', element: <PlaceholderPage title="Compras" phase="Fase 2" /> },
      { path: 'suppliers', element: <PlaceholderPage title="Proveedores" phase="Fase 2" /> },
      { path: 'recipes', element: <PlaceholderPage title="Recetas" phase="Fase 3" /> },
      { path: 'products', element: <PlaceholderPage title="Platos" phase="Fase 3" /> },
      { path: 'menus', element: <PlaceholderPage title="Menú" phase="Fase 4" /> },
      { path: 'customers', element: <PlaceholderPage title="Clientes" phase="Fase 5" /> },
      { path: 'reports', element: <PlaceholderPage title="Reportes" phase="Fase 8" /> },
      { path: 'users', element: <PlaceholderPage title="Usuarios" phase="Fase 1" /> },
    ],
  },
])
