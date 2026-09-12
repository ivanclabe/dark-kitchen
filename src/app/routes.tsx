import { LoginPage } from '@/modules/auth/pages/LoginPage'
import { SignUpAdminPage } from '@/modules/auth/pages/SignUpAdminPage'
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage'
import { InventoryPage } from '@/modules/inventory/pages/InventoryPage'
import { MovementsPage } from '@/modules/inventory/pages/MovementsPage'
import { PurchasesPage } from '@/modules/purchases/pages/PurchasesPage'
import { PurchaseDetailPage } from '@/modules/purchases/pages/PurchaseDetailPage'
import { SuppliersPage } from '@/modules/suppliers/pages/SuppliersPage'
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
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'inventory/movimientos', element: <MovementsPage /> },
      { path: 'purchases', element: <PurchasesPage /> },
      { path: 'purchases/:id', element: <PurchaseDetailPage /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'recipes', element: <PlaceholderPage title="Recetas" phase="Fase 3" /> },
      { path: 'products', element: <PlaceholderPage title="Platos" phase="Fase 3" /> },
      { path: 'menus', element: <PlaceholderPage title="Menú" phase="Fase 4" /> },
      { path: 'customers', element: <PlaceholderPage title="Clientes" phase="Fase 5" /> },
      { path: 'reports', element: <PlaceholderPage title="Reportes" phase="Fase 8" /> },
      { path: 'users', element: <PlaceholderPage title="Usuarios" phase="Fase 1" /> },
    ],
  },
])
