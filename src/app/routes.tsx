import { LandingPage } from '@/modules/landing/pages/LandingPage'
import { LoginPage } from '@/modules/auth/pages/LoginPage'
import { SignUpAdminPage } from '@/modules/auth/pages/SignUpAdminPage'
import { SupplyPage } from '@/modules/supply/pages/SupplyPage'
import { MenuPlannerPage } from '@/modules/menuPlanner/pages/MenuPlannerPage'
import { RecipeEditorPage } from '@/modules/recipes/pages/RecipeEditorPage'
import { CustomersPage } from '@/modules/customers/pages/CustomersPage'
import { CustomerDetailPage } from '@/modules/customers/pages/CustomerDetailPage'
import { KitchenPage } from '@/modules/kitchen/pages/KitchenPage'
import { UsersAndPermissionsPage } from '@/modules/organization/pages/UsersAndPermissionsPage'
import { OrganizationSettingsPage } from '@/modules/organization/pages/OrganizationSettingsPage'
import { ActivationPage } from '@/modules/invitations/pages/ActivationPage'
import { SignUpPage } from '@/modules/signup/pages/SignUpPage'
import { SignUpConfirmedPage } from '@/modules/signup/pages/SignUpConfirmedPage'
import { PlatformAdminPage } from '@/modules/platform/pages/PlatformAdminPage'
import { ProfilePage } from '@/modules/profile/pages/ProfilePage'
import { KitchenSelectorPage } from '@/modules/kitchens/pages/KitchenSelectorPage'
import { FeaturesSettingsPage } from '@/modules/settings/pages/FeaturesSettingsPage'
import { KitchenGeneralPage } from '@/modules/settings/pages/KitchenGeneralPage'
import { SettingsLayout } from '@/modules/settings/pages/SettingsLayout'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { KitchenEntryRedirect, LegacyKitchenRedirect } from './kitchenEntry'
import { KitchenScope } from './KitchenScope'
import { ProtectedRoute } from './ProtectedRoute'

/** Redirección a una sección de la Cocina activa (las rutas viejas de dentro de la app). */
function KitchenRedirect({ to }: { to: string }) {
  const { path } = useActiveKitchen()
  return <Navigate to={path(to)} replace />
}

/** /orders/:id (ruta vieja) → el tablero de Cocina con ese pedido abierto en el detalle. */
function LegacyOrderRedirect() {
  const { id } = useParams<{ id: string }>()
  return <KitchenRedirect to={id ? `/kitchen?pedido=${id}` : '/kitchen'} />
}

/** /purchases/:id (ruta vieja) → el detalle de esa misma compra dentro de Abastecimiento. */
function LegacyPurchaseRedirect() {
  const { id } = useParams<{ id: string }>()
  return <KitchenRedirect to={id ? `/supply/compras/${id}` : '/supply/compras'} />
}

// recharts (usado solo por Dashboard y Reportes) pesa bastante — se separa en
// su propio chunk para que el resto de la app (cocina, pedidos, etc.) no
// pague ese costo en la carga inicial.
const DashboardPage = lazy(() =>
  import('@/modules/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const ReportsPage = lazy(() => import('@/modules/reports/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))

const loading = <p className="text-neutral-400">Cargando…</p>

export const router = createBrowserRouter([
  // Pública: presentación del producto, antes de iniciar sesión.
  { path: '/landing', element: <LandingPage /> },
  // Precios (ADR 0010): enlace para compartir; la landing se ve con o sin sesión en /landing.
  { path: '/precios', element: <Navigate to={{ pathname: '/landing', hash: '#precios' }} replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup-admin', element: <SignUpAdminPage /> },
  // El personal entra por invitación (ADR 0007, Fase 5): el autorregistro abierto ya no existe.
  { path: '/signup-staff', element: <Navigate to="/login" replace /> },
  // Enlaces de invitación anteriores (ADR 0007): se reemplazaron por el enlace de activación.
  { path: '/invitacion/:token', element: <Navigate to="/login" replace /> },
  // Activación de un usuario creado por un administrador (ADR 0008, sección 10).
  { path: '/activar/:token', element: <ActivationPage /> },
  // Registro público de un negocio (ADR 0008, Fase F) y la vuelta del enlace de confirmación.
  { path: '/registro', element: <SignUpPage /> },
  { path: '/registro/confirmado', element: <SignUpConfirmedPage /> },

  // "/": sin sesión, la landing; con sesión, directo a la Cocina por defecto o al selector.
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <KitchenEntryRedirect />
      </ProtectedRoute>
    ),
  },
  // Tus cuentas: elegir, cambiar y (SUPER_ADMIN) crear.
  {
    path: '/cuentas',
    element: (
      <ProtectedRoute>
        <KitchenSelectorPage />
      </ProtectedRoute>
    ),
  },
  // Dirección anterior del selector.
  { path: '/cocinas', element: <Navigate to="/cuentas" replace /> },

  // Administración de la plataforma (superusuario): todas las Cocinas.
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <PlatformAdminPage />
      </ProtectedRoute>
    ),
  },

  // Toda la app vive dentro de una Cocina (ADR 0007): /k/{slug}/…
  {
    path: '/k/:kitchenSlug',
    element: (
      <ProtectedRoute>
        <KitchenScope />
      </ProtectedRoute>
    ),
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Suspense fallback={loading}><DashboardPage /></Suspense> },
          // Cocina — el centro operativo: un solo tablero con el flujo completo
          // del pedido (por confirmar → en cola → preparando → listo → en ruta).
          { path: 'kitchen', element: <KitchenPage /> },
          { path: 'orders', element: <KitchenRedirect to="/kitchen" /> },
          { path: 'orders/:id', element: <LegacyOrderRedirect /> },
          { path: 'delivery', element: <KitchenRedirect to="/kitchen" /> },
          // Catálogo — Planificador de Menús: platos, calendario y recetas.
          { path: 'menu-planner', element: <MenuPlannerPage /> },
          { path: 'recipes/:productId', element: <RecipeEditorPage /> },
          // Abastecimiento — Stock, Compras y Proveedores. La vista y el elemento seleccionado viven en la URL.
          { path: 'supply', element: <SupplyPage /> },
          { path: 'supply/:view', element: <SupplyPage /> },
          { path: 'supply/:view/:id', element: <SupplyPage /> },
          { path: 'inventory', element: <KitchenRedirect to="/supply/stock" /> },
          { path: 'inventory/movimientos', element: <KitchenRedirect to="/supply/stock" /> },
          { path: 'purchases', element: <KitchenRedirect to="/supply/compras" /> },
          { path: 'purchases/:id', element: <LegacyPurchaseRedirect /> },
          { path: 'suppliers', element: <KitchenRedirect to="/supply/proveedores" /> },
          // Clientes — saldos, pagos e historial.
          { path: 'customers', element: <CustomersPage /> },
          { path: 'customers/:id', element: <CustomerDetailPage /> },
          { path: 'reports', element: <Suspense fallback={loading}><ReportsPage /></Suspense> },
          // Mi perfil: nombre, avatar y contraseña de la persona (ADR 0008, Fase A).
          { path: 'perfil', element: <ProfilePage /> },
          // Usuarios y permisos (toda la organización para el SUPER_ADMIN; su Cuenta para el Administrador).
          { path: 'users', element: <UsersAndPermissionsPage /> },
          // Configuración de la organización (SUPER_ADMIN).
          { path: 'organizacion', element: <OrganizationSettingsPage /> },
          // Configuración de la Cuenta: datos generales y funciones (IA, voz; ADR 0009).
          {
            path: 'settings',
            element: <SettingsLayout />,
            children: [
              { path: 'general', element: <KitchenGeneralPage /> },
              { path: 'features', element: <FeaturesSettingsPage /> },
              // Dirección anterior de la pestaña de IA.
              { path: 'ai', element: <Navigate to="../features" replace /> },
            ],
          },
          { path: '*', element: <KitchenRedirect to="/" /> },
        ],
      },
    ],
  },

  // Direcciones anteriores a multi-cocina (/kitchen, /supply/…, /customers/:id…):
  // misma sección en la Cocina por defecto, sin romper enlaces guardados.
  {
    path: '*',
    element: (
      <ProtectedRoute>
        <LegacyKitchenRedirect />
      </ProtectedRoute>
    ),
  },
])
