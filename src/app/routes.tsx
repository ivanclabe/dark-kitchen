import { LandingPage } from '@/modules/landing/pages/LandingPage'
import { LoginPage } from '@/modules/auth/pages/LoginPage'
import { SignUpAdminPage } from '@/modules/auth/pages/SignUpAdminPage'
import { SignUpStaffPage } from '@/modules/auth/pages/SignUpStaffPage'
import { SupplyPage } from '@/modules/supply/pages/SupplyPage'
import { MenuPlannerPage } from '@/modules/menuPlanner/pages/MenuPlannerPage'
import { RecipeEditorPage } from '@/modules/recipes/pages/RecipeEditorPage'
import { CustomersPage } from '@/modules/customers/pages/CustomersPage'
import { CustomerDetailPage } from '@/modules/customers/pages/CustomerDetailPage'
import { KitchenPage } from '@/modules/kitchen/pages/KitchenPage'
import { UsersPage } from '@/modules/users/pages/UsersPage'
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { ProtectedRoute } from './ProtectedRoute'

/** /orders/:id (ruta vieja) → el tablero de Cocina con ese pedido abierto en el detalle. */
function LegacyOrderRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={id ? `/kitchen?pedido=${id}` : '/kitchen'} replace />
}

/** /purchases/:id (ruta vieja) → el detalle de esa misma compra dentro de Abastecimiento. */
function LegacyPurchaseRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={id ? `/supply/compras/${id}` : '/supply/compras'} replace />
}

// recharts (usado solo por Dashboard y Reportes) pesa bastante — se separa en
// su propio chunk para que el resto de la app (cocina, pedidos, etc.) no
// pague ese costo en la carga inicial.
const DashboardPage = lazy(() =>
  import('@/modules/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const ReportsPage = lazy(() => import('@/modules/reports/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))

export const router = createBrowserRouter([
  // Pública: presentación del producto, antes de iniciar sesión.
  { path: '/landing', element: <LandingPage /> },
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
      // Cocina — el centro operativo: un solo tablero con el flujo completo
      // del pedido (por confirmar → en cola → preparando → listo → en ruta),
      // que reemplaza las pantallas separadas de Pedidos, Cola y Despacho.
      // Las rutas viejas redirigen para no romper enlaces (Dashboard, Clientes).
      { path: 'kitchen', element: <KitchenPage /> },
      { path: 'orders', element: <Navigate to="/kitchen" replace /> },
      { path: 'orders/:id', element: <LegacyOrderRedirect /> },
      { path: 'delivery', element: <Navigate to="/kitchen" replace /> },
      // Catálogo — Planificador de Menús: platos, calendario de disponibilidad
      // y recetas en una sola experiencia (reemplaza Platos/Menús/Menú del
      // día/Menú semanal/Recetas). La receta de un plato sigue siendo una
      // ruta propia (drill-in desde el catálogo lateral), sin cambios.
      { path: 'menu-planner', element: <MenuPlannerPage /> },
      { path: 'recipes/:productId', element: <RecipeEditorPage /> },
      // Abastecimiento — Stock, Compras y Proveedores en una sola experiencia
      // (reemplaza Inventario/Movimientos/Compras/Proveedores por separado).
      // La vista y el elemento seleccionado viven en la URL.
      { path: 'supply', element: <SupplyPage /> },
      { path: 'supply/:view', element: <SupplyPage /> },
      { path: 'supply/:view/:id', element: <SupplyPage /> },
      // Rutas viejas: se conservan como redirecciones para no romper enlaces
      // guardados ni la memoria muscular del equipo.
      { path: 'inventory', element: <Navigate to="/supply/stock" replace /> },
      { path: 'inventory/movimientos', element: <Navigate to="/supply/stock" replace /> },
      { path: 'purchases', element: <Navigate to="/supply/compras" replace /> },
      { path: 'purchases/:id', element: <LegacyPurchaseRedirect /> },
      { path: 'suppliers', element: <Navigate to="/supply/proveedores" replace /> },
      // Clientes — dashboard (antes "Cartera"/"Clientes" separados) + ficha
      // individual con saldo, pedidos y pagos. Reutiliza dk_receivables y
      // dk_register_payment sin cambios, solo la presentación.
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
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
