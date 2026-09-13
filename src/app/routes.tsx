import { LoginPage } from '@/modules/auth/pages/LoginPage'
import { SignUpAdminPage } from '@/modules/auth/pages/SignUpAdminPage'
import { SignUpStaffPage } from '@/modules/auth/pages/SignUpStaffPage'
import { InventoryPage } from '@/modules/inventory/pages/InventoryPage'
import { MovementsPage } from '@/modules/inventory/pages/MovementsPage'
import { PurchasesPage } from '@/modules/purchases/pages/PurchasesPage'
import { PurchaseDetailPage } from '@/modules/purchases/pages/PurchaseDetailPage'
import { ProductsPage } from '@/modules/products/pages/ProductsPage'
import { RecipesPage } from '@/modules/recipes/pages/RecipesPage'
import { RecipeEditorPage } from '@/modules/recipes/pages/RecipeEditorPage'
import { MenusPage } from '@/modules/menus/pages/MenusPage'
import { MenuDetailPage } from '@/modules/menus/pages/MenuDetailPage'
import { TodayMenuPage } from '@/modules/menus/pages/TodayMenuPage'
import { SuppliersPage } from '@/modules/suppliers/pages/SuppliersPage'
import { CustomersPage } from '@/modules/customers/pages/CustomersPage'
import { OrdersPage } from '@/modules/orders/pages/OrdersPage'
import { OrderDetailPage } from '@/modules/orders/pages/OrderDetailPage'
import { KitchenPage } from '@/modules/kitchen/pages/KitchenPage'
import { DeliveryPage } from '@/modules/delivery/pages/DeliveryPage'
import { UsersPage } from '@/modules/users/pages/UsersPage'
import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { ProtectedRoute } from './ProtectedRoute'

// recharts (usado solo por Dashboard y Reportes) pesa bastante — se separa en
// su propio chunk para que el resto de la app (cocina, pedidos, etc.) no
// pague ese costo en la carga inicial.
const DashboardPage = lazy(() =>
  import('@/modules/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const ReportsPage = lazy(() => import('@/modules/reports/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup-admin', element: <SignUpAdminPage /> },
  { path: '/signup-staff', element: <SignUpStaffPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<p className="text-neutral-400">Cargando…</p>}>
            <DashboardPage />
          </Suspense>
        ),
      },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'orders/:id', element: <OrderDetailPage /> },
      { path: 'kitchen', element: <KitchenPage /> },
      { path: 'delivery', element: <DeliveryPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'inventory/movimientos', element: <MovementsPage /> },
      { path: 'purchases', element: <PurchasesPage /> },
      { path: 'purchases/:id', element: <PurchaseDetailPage /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'recipes', element: <RecipesPage /> },
      { path: 'recipes/:productId', element: <RecipeEditorPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'menus', element: <MenusPage /> },
      { path: 'menus/dia', element: <TodayMenuPage /> },
      { path: 'menus/:id', element: <MenuDetailPage /> },
      { path: 'customers', element: <CustomersPage /> },
      {
        path: 'reports',
        element: (
          <Suspense fallback={<p className="text-neutral-400">Cargando…</p>}>
            <ReportsPage />
          </Suspense>
        ),
      },
      { path: 'users', element: <UsersPage /> },
    ],
  },
])
