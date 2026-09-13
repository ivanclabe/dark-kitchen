import { LoginPage } from '@/modules/auth/pages/LoginPage'
import { SignUpAdminPage } from '@/modules/auth/pages/SignUpAdminPage'
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage'
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
      { path: 'reports', element: <PlaceholderPage title="Reportes" phase="Fase 8" /> },
      { path: 'users', element: <PlaceholderPage title="Usuarios" phase="Fase 1" /> },
    ],
  },
])
