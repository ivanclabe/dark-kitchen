import { canAccessAnyModule, type Can, type ModuleKey } from '@/shared/rbac/roles'
import { BarChart3, CalendarClock, ChefHat, ClipboardList, LayoutDashboard, Settings, Soup, UserCog, Users, Warehouse, type LucideIcon } from 'lucide-react'

/**
 * Módulos de operación del rail (13 -> 6 ítems, ver auditoría de
 * navegación): cada entrada apunta a su ruta "principal" pero se resalta en
 * cualquiera de `matchPrefixes`. Es visible si el rol activo tiene acceso a
 * AL MENOS UNO de `modules`. Usuarios y Configuración van aparte, debajo
 * (ADMIN_NAV_ITEMS); Mi perfil vive en el menú de usuario (ADR 0008).
 */
export interface NavItem {
  to: string
  label: string
  description: string
  modules: ModuleKey[]
  icon: LucideIcon
  matchPrefixes?: string[]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', description: 'Resumen del negocio', modules: ['dashboard'], icon: LayoutDashboard },
  {
    to: '/orders',
    label: 'Pedidos',
    description: 'El centro operativo: tablero, lista y despacho',
    modules: ['orders'],
    icon: ClipboardList,
    matchPrefixes: ['/orders', '/delivery'],
  },
  {
    to: '/kitchen',
    label: 'Cocina',
    description: 'La pantalla de preparación de los pedidos',
    modules: ['kitchen'],
    icon: ChefHat,
  },
  {
    to: '/menu-planner',
    label: 'Catálogo',
    description: 'Planificador de menús, platos y recetas',
    modules: ['menuPlanner'],
    icon: Soup,
    matchPrefixes: ['/menu-planner', '/recipes'],
  },
  {
    to: '/supply',
    label: 'Abastecimiento',
    description: 'Stock, compras y proveedores',
    modules: ['supply'],
    icon: Warehouse,
    matchPrefixes: ['/supply', '/inventory', '/purchases', '/suppliers'],
  },
  {
    to: '/customers',
    label: 'Clientes',
    description: 'Saldos, pagos e historial de cada cliente',
    modules: ['customers'],
    icon: Users,
    matchPrefixes: ['/customers'],
  },
  {
    to: '/staff',
    label: 'Personal',
    description: 'Turnos del equipo, asistencia y horas',
    modules: ['staff'],
    icon: CalendarClock,
  },
  {
    to: '/insights',
    label: 'Insights',
    description: 'Cómo va el negocio: ventas, costos y rentabilidad',
    modules: ['reports'],
    icon: BarChart3,
    matchPrefixes: ['/insights', '/reports'],
  },
]

/**
 * Administration of the account (ADR 0024), below a divider in the rail:
 * Usuarios (Usuarios · Roles y permisos) and Configuración (General ·
 * Facturación · IA y voz · Integraciones · Actividad). Always this account.
 */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: '/users', label: 'Usuarios', description: 'Usuarios, roles y permisos de esta cuenta', modules: ['users'], icon: UserCog },
  {
    to: '/settings',
    label: 'Configuración',
    description: 'General, facturación, IA y voz, integraciones y actividad',
    modules: ['settings'],
    icon: Settings,
  },
]

const matches = (section: string, prefix: string) => section === prefix || section.startsWith(`${prefix}/`)

/** `section` = la ruta dentro de la Cuenta activa ('/', '/kitchen', '/supply/compras'…). */
export function isNavItemActive(section: string, item: NavItem): boolean {
  return (item.matchPrefixes ?? [item.to]).some((p) => matches(section, p))
}

/**
 * ¿Puede el rol activo abrir esta sección? Es UX (la base igual rechaza lo
 * no permitido): evita pantallas con "No autorizado" al entrar por un
 * enlace o al cambiar a un rol con menos permisos. Lo que no pertenece a
 * ningún módulo (p. ej. /perfil) siempre se permite.
 */
export function isSectionAllowed(section: string, can: Can): boolean {
  // "/" is "your start": it sends each role to its own screen (homeSection).
  if (section === '/') return true
  const item = NAV_ITEMS.find((i) => isNavItemActive(section, i))
  if (item) return canAccessAnyModule(can, item.modules)
  const admin = ADMIN_NAV_ITEMS.find((i) => isNavItemActive(section, i))
  return admin ? canAccessAnyModule(can, admin.modules) : true
}

/**
 * Where each role starts (ADR 0020, D3), decided by permissions so custom
 * roles follow the same rule:
 *   - rider (delivers, does not see all orders)  → Pedidos (Despacho)
 *   - kitchen (prepares, does not create orders) → Cocina
 *   - cashier (creates orders, does not manage)  → Pedidos
 *   - everyone else → their first module (Dashboard for administration)
 */
export function homeSection(can: Can): string {
  const preferred =
    can('dispatch.deliver') && !can('orders.view')
      ? '/orders'
      : can('kitchen.prepare') && !can('orders.create')
        ? '/kitchen'
        : can('orders.create') && !can('settings.manage')
          ? '/orders'
          : null
  if (preferred && isSectionAllowed(preferred, can)) return preferred
  return NAV_ITEMS.find((i) => canAccessAnyModule(can, i.modules))?.to ?? '/perfil'
}
