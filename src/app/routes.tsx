import { LandingPage } from '@/modules/landing/pages/LandingPage'
import { LoadingState } from '@/shared/ui/LoadingState'
import { applyRouteDefault } from '@/shared/appearance/appearance'
import { APP_ENTRY } from '@/shared/tenant/navigation'
import { LoginPage } from '@/modules/auth/pages/LoginPage'
import { SetPasswordPage } from '@/modules/auth/pages/SetPasswordPage'
import { SignUpAdminPage } from '@/modules/auth/pages/SignUpAdminPage'
import { OperationsRedirect } from '@/modules/operations/components/OperationsRedirect'
import { OrderTrackingRoute, PublicMenuRoute } from '@/modules/publicMenu/public/PublicRoutes'
import { ActivationPage } from '@/modules/invitations/pages/ActivationPage'
import { SignUpPage } from '@/modules/signup/pages/SignUpPage'
import { SignUpConfirmedPage } from '@/modules/signup/pages/SignUpConfirmedPage'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { HelpElsewhere } from '@/modules/help/redirects'
import { DOCS_ROUTES, helpCenterRoutes } from '@/modules/help/routes'
import { currentHost } from '@/shared/tenant/host'
import { TenantGate } from '@/shared/tenant/TenantProvider'
import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Navigate, useParams, type RouteObject } from 'react-router-dom'
import { homeSection } from './navigation'
import { KitchenEntryRedirect, LegacyKitchenRedirect, LegacyOrgRedirect } from './kitchenEntry'
import { KitchenScope } from './KitchenScope'
import { FullScreenLoading } from './FullScreenLoading'
import { ProtectedRoute } from './ProtectedRoute'

/** Redirección a una sección de la Cocina activa (las rutas viejas de dentro de la app). */
function KitchenRedirect({ to }: { to: string }) {
  const { path } = useActiveKitchen()
  return <Navigate to={path(to)} replace />
}

/** The account's start: Pedidos for a cashier, Cocina for the line, Despacho for a rider, Dashboard for administration. */
function RoleHome() {
  const { can, path } = useActiveKitchen()
  return <Navigate to={path(homeSection(can))} replace />
}

/** /purchases/:id (ruta vieja) → el detalle de esa misma compra dentro de Abastecimiento. */
function LegacyPurchaseRedirect() {
  const { id } = useParams<{ id: string }>()
  return <KitchenRedirect to={id ? `/supply/compras/${id}` : '/supply/compras'} />
}

// recharts (usado solo por Dashboard e Insights) pesa bastante — se separa en
// su propio chunk para que el resto de la app (cocina, pedidos, etc.) no
// pague ese costo en la carga inicial.
const DashboardPage = lazy(() =>
  import('@/modules/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const InsightsPage = lazy(() => import('@/modules/insights/pages/InsightsPage').then((m) => ({ default: m.InsightsPage })))

// A lazy page (dashboard, Insights) inside the layout: its skeleton, not a bare «Cargando…».
const loading = <LoadingState variant="cards" rows={3} cols={3} label="Preparando la pantalla…" />

/**
 * A screen of the app, downloaded when it is opened (the route's `lazy`): the landing, the sign-in and
 * the public menu no longer download the whole app first. While the first one arrives, the full-screen wait.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: (await load())[name] }) }
}

const routes: RouteObject[] = [
  // Pública: presentación del producto, antes de iniciar sesión.
  { path: '/landing', element: <LandingPage /> },
  // Precios (ADR 0010): enlace para compartir; la landing se ve con o sin sesión en /landing.
  { path: '/precios', element: <Navigate to={{ pathname: '/landing', hash: '#precios' }} replace /> },
  { path: '/login', element: <LoginPage /> },
  // Link to create or change the password, shared from the Global Admin portal (ADR 0019).
  { path: '/set-password', element: <SetPasswordPage /> },
  { path: '/signup-admin', element: <SignUpAdminPage /> },
  // El personal entra por invitación (ADR 0007, Fase 5): el autorregistro abierto ya no existe.
  { path: '/signup-staff', element: <Navigate to="/login" replace /> },
  // Enlaces de invitación anteriores (ADR 0007): se reemplazaron por el enlace de activación.
  { path: '/invitacion/:token', element: <Navigate to="/login" replace /> },
  // Activación de un usuario creado por un administrador (ADR 0008, sección 10).
  { path: '/activar/:token', element: <ActivationPage /> },
  // Centro de ayuda público (ADR 0034): vive en doc.quanela.com (ADR 0035). Aquí /help lleva allá;
  // sin dominio raíz (vistas previas) sigue dentro de la app.
  currentHost().kind === 'path' ? helpCenterRoutes('/help') : { path: '/help/*', Component: HelpElsewhere },
  // Registro público de un negocio (ADR 0008, Fase F) y la vuelta del enlace de confirmación.
  { path: '/registro', element: <SignUpPage /> },
  { path: '/registro/confirmado', element: <SignUpConfirmedPage /> },
  // Menú público (ADR 0052): today's menu of a business and its orders, without a session, on any host.
  { path: '/menu/:slug', element: <PublicMenuRoute /> },
  { path: '/menu/:slug/pedido/:token', element: <OrderTrackingRoute /> },

  // "/" (ADR 0036): en quanela.com, siempre la landing (con sesión, «Ir a mi cuenta»). En el subdominio
  // de un negocio (y sin dominio raíz), la app: sin sesión, su login; con sesión, la Cuenta por defecto.
  currentHost().kind === 'root'
    ? { path: '/', element: <LandingPage /> }
    : {
        path: '/',
        element: (
          <ProtectedRoute>
            <KitchenEntryRedirect />
          </ProtectedRoute>
        ),
      },
  // «Ir a mi cuenta» desde cualquier host: la Cuenta por defecto, en su subdominio.
  {
    path: APP_ENTRY,
    element: (
      <ProtectedRoute>
        <KitchenEntryRedirect />
      </ProtectedRoute>
    ),
  },
  // Tus cuentas: elegir, cambiar y (SUPER_ADMIN) crear.
  {
    path: '/cuentas',
    lazy: async () => {
      const { KitchenSelectorPage } = await import('@/modules/kitchens/pages/KitchenSelectorPage')
      return { element: <ProtectedRoute><KitchenSelectorPage /></ProtectedRoute> }
    },
  },
  // Dirección anterior del selector.
  { path: '/cocinas', element: <Navigate to="/cuentas" replace /> },

  // La plataforma se administra en el portal Global Admin (admin.quanela.com, ADR 0019).
  { path: '/admin/*', element: <Navigate to={APP_ENTRY} replace /> },

  // The organization's administration center (ADR 0012) no longer exists (ADR 0024):
  // its old addresses go to their equivalent inside an account.
  {
    path: '/o/:orgSlug/*',
    element: (
      <ProtectedRoute>
        <LegacyOrgRedirect />
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
        ...page(() => import('./AppLayout'), 'AppLayout'),
        children: [
          // "/" = your start: each role lands on its own screen (ADR 0020, D3).
          { index: true, element: <RoleHome /> },
          { path: 'dashboard', element: <Suspense fallback={loading}><DashboardPage /></Suspense> },
          // Centro de operaciones (ADR 0031): Tablero, Cocina, Despacho y Lista
          // del mismo pedido; /operations/:orderId abre su detalle sobre la vista.
          { path: 'operations', ...page(() => import('@/modules/operations/pages/OperationsPage'), 'OperationsPage') },
          { path: 'operations/:orderId', ...page(() => import('@/modules/operations/pages/OperationsPage'), 'OperationsPage') },
          // Las direcciones de antes (Pedidos y Cocina) llevan a la misma vista.
          { path: 'orders', element: <OperationsRedirect /> },
          { path: 'orders/:orderId', element: <OperationsRedirect /> },
          { path: 'kitchen', element: <OperationsRedirect view="kitchen" /> },
          { path: 'delivery', element: <OperationsRedirect view="dispatch" /> },
          // Catálogo — Planificador de Menús: platos, calendario y recetas; ?view=shared, los platos compartidos (ADR 0024).
          { path: 'menu-planner', ...page(() => import('@/modules/menuPlanner/pages/CatalogPage'), 'CatalogPage') },
          { path: 'recipes/:productId', ...page(() => import('@/modules/recipes/pages/RecipeEditorPage'), 'RecipeEditorPage') },
          // ADR 0059: what the customer chooses in a dish.
          { path: 'dishes/:productId/composition', ...page(() => import('@/modules/menuPlanner/pages/CompositionEditorPage'), 'CompositionEditorPage') },
          // Abastecimiento — Stock, Compras y Proveedores. La vista y el elemento seleccionado viven en la URL.
          { path: 'supply', ...page(() => import('@/modules/supply/pages/SupplyPage'), 'SupplyPage') },
          { path: 'supply/:view', ...page(() => import('@/modules/supply/pages/SupplyPage'), 'SupplyPage') },
          { path: 'supply/:view/:id', ...page(() => import('@/modules/supply/pages/SupplyPage'), 'SupplyPage') },
          // ADR 0049: importar una compra desde una factura (leer y revisar).
          // ADR 0057: a preparation's recipe, in the recipe editor.
          { path: 'supply/preparaciones/:id/receta', ...page(() => import('@/modules/supply/pages/PreparationRecipePage'), 'PreparationRecipePage') },
          { path: 'supply/compras/importar', ...page(() => import('@/modules/supply/pages/InvoiceImportPage'), 'InvoiceImportPage') },
          { path: 'supply/compras/importar/:importId', ...page(() => import('@/modules/supply/pages/InvoiceImportPage'), 'InvoiceImportPage') },
          { path: 'inventory', element: <KitchenRedirect to="/supply/stock" /> },
          { path: 'inventory/movimientos', element: <KitchenRedirect to="/supply/stock" /> },
          { path: 'purchases', element: <KitchenRedirect to="/supply/compras" /> },
          { path: 'purchases/:id', element: <LegacyPurchaseRedirect /> },
          { path: 'suppliers', element: <KitchenRedirect to="/supply/proveedores" /> },
          // Personal y Turnos (ADR 0020); "Mis turnos" es de cada persona, sin permiso.
          { path: 'staff', ...page(() => import('@/modules/staff/pages/StaffPage'), 'StaffPage') },
          // Finanzas (ADR 0051): obligaciones, pagos, flujo de caja y rentabilidad real.
          { path: 'finance', ...page(() => import('@/modules/finance/pages/FinancePage'), 'FinancePage') },
          { path: 'finance/:tab', ...page(() => import('@/modules/finance/pages/FinancePage'), 'FinancePage') },
          // Menú público (ADR 0052): publish, ordering options, link and QR; Diseño (ADR 0053).
          { path: 'public-menu', ...page(() => import('@/modules/publicMenu/pages/PublicMenuAdminPage'), 'PublicMenuAdminPage') },
          { path: 'public-menu/:tab', ...page(() => import('@/modules/publicMenu/pages/PublicMenuAdminPage'), 'PublicMenuAdminPage') },
          // WhatsApp e Integraciones (ADR 0055).
          { path: 'integrations', ...page(() => import('@/modules/integrations/pages/IntegrationsPage'), 'IntegrationsPage') },
          { path: 'integrations/:tab', ...page(() => import('@/modules/integrations/pages/IntegrationsPage'), 'IntegrationsPage') },
          { path: 'my-shifts', ...page(() => import('@/modules/staff/pages/MyShiftsPage'), 'MyShiftsPage') },
          // Clientes — saldos, pagos e historial.
          { path: 'customers', ...page(() => import('@/modules/customers/pages/CustomersPage'), 'CustomersPage') },
          { path: 'customers/:id', ...page(() => import('@/modules/customers/pages/CustomerDetailPage'), 'CustomerDetailPage') },
          // Quanela Consumer (ADR 0046): Resumen · Perfil del negocio · Platos. It used to live in Configuración.
          { path: 'consumer', ...page(() => import('@/modules/consumer/pages/ConsumerPage'), 'ConsumerPage') },
          { path: 'consumer/:section', ...page(() => import('@/modules/consumer/pages/ConsumerPage'), 'ConsumerPage') },
          { path: 'settings/consumer', element: <KitchenRedirect to="/consumer" /> },
          // Insights (ADR 0027): how the business is doing. /reports is its old address.
          { path: 'insights', element: <Suspense fallback={loading}><InsightsPage /></Suspense> },
          { path: 'reports', element: <KitchenRedirect to="/insights" /> },
          // Mi perfil: nombre, avatar y contraseña de la persona (ADR 0008, Fase A).
          { path: 'perfil', ...page(() => import('@/modules/profile/pages/ProfilePage'), 'ProfilePage') },
          // Usuarios: Usuarios · Roles y permisos, always of this account (ADR 0024), in the shell of Configuración (ADR 0026).
          {
            path: 'users',
            ...page(() => import('@/modules/organization/pages/UsersAndPermissionsPage'), 'UsersLayout'),
            children: [
              { index: true, ...page(() => import('@/modules/organization/pages/UsersAndPermissionsPage'), 'UsersPage') },
              { path: 'roles', ...page(() => import('@/modules/organization/pages/UsersAndPermissionsPage'), 'RolesPage') },
              { path: '*', element: <Navigate to=".." replace /> },
            ],
          },
          // Old address of the organization settings.
          { path: 'organizacion', element: <KitchenRedirect to="/settings/general" /> },
          // Configuración of the account (ADR 0024): General, Facturación, IA y voz, Integraciones, Actividad.
          {
            path: 'settings',
            ...page(() => import('@/modules/settings/pages/SettingsLayout'), 'SettingsLayout'),
            children: [
              { path: 'general', ...page(() => import('@/modules/settings/pages/KitchenGeneralPage'), 'KitchenGeneralPage') },
              { path: 'billing', ...page(() => import('@/modules/settings/pages/BillingSettingsPage'), 'BillingSettingsPage') },
              { path: 'ai', ...page(() => import('@/modules/settings/pages/AiSettingsPage'), 'AiSettingsPage') },
              { path: 'integrations', ...page(() => import('@/modules/settings/pages/IntegrationsSettingsPage'), 'IntegrationsSettingsPage') },
              { path: 'activity', ...page(() => import('@/modules/settings/pages/ActivitySettingsPage'), 'ActivitySettingsPage') },
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
]

// Every route goes through the gate of the subdomain's organization (ADR 0021);
// doc.quanela.com is only the help center (ADR 0035).
export const router = createBrowserRouter(
  currentHost().kind === 'docs' ? DOCS_ROUTES : [{ element: <TenantGate />, hydrateFallbackElement: <FullScreenLoading stage="page" />, children: routes }],
)

// ADR 0061: without a chosen theme, the sign-in and the help center are light and the app dark, also when moving between them.
router.subscribe((state) => applyRouteDefault(state.location.pathname))
