import { canAccessAnyModule, type Can, type ModuleKey } from '@/shared/rbac/roles'
import { Activity, BarChart3, CalendarClock, Globe, Landmark, LayoutDashboard, MessageCircle, Settings, Soup, Store, UserCog, Users, Warehouse, type LucideIcon } from 'lucide-react'

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
  /** Where it sits in the rail: groups are separated by a divider and titled in «Más» and on the phone. */
  group: NavGroup
  matchPrefixes?: string[]
}

export type NavGroup = 'daily' | 'sales' | 'business' | 'admin'

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  daily: 'Día a día',
  sales: 'Clientes y ventas',
  business: 'Negocio',
  admin: 'Administración',
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Inicio', description: 'La operación de hoy y lo que necesita atención', modules: ['dashboard'], icon: LayoutDashboard, group: 'daily' },
  {
    to: '/operations',
    label: 'Operación',
    description: 'Centro de operaciones: pedidos, cocina y despacho',
    modules: ['orders', 'kitchen'],
    icon: Activity,
    group: 'daily',
    matchPrefixes: ['/operations', '/orders', '/kitchen', '/delivery'],
  },
  {
    to: '/menu-planner',
    label: 'Catálogo',
    description: 'Planificador de menús, platos y recetas',
    modules: ['menuPlanner'],
    icon: Soup,
    group: 'daily',
    matchPrefixes: ['/menu-planner', '/recipes'],
  },
  {
    to: '/supply',
    label: 'Abastecimiento',
    description: 'Stock, compras y proveedores',
    modules: ['supply'],
    icon: Warehouse,
    group: 'daily',
    matchPrefixes: ['/supply', '/inventory', '/purchases', '/suppliers'],
  },
  {
    to: '/customers',
    label: 'Clientes',
    description: 'Saldos, pagos e historial de cada cliente',
    modules: ['customers'],
    icon: Users,
    group: 'sales',
    matchPrefixes: ['/customers'],
  },
  {
    to: '/public-menu',
    label: 'Menú público',
    description: 'Tu menú de hoy en una página para tus clientes, con pedidos que entran a cocina',
    modules: ['publicMenu'],
    icon: Globe,
    group: 'sales',
  },
  {
    to: '/integrations',
    label: 'WhatsApp',
    description: 'WhatsApp e Integraciones: tu número oficial, avisos de pedidos y n8n',
    modules: ['integrations'],
    icon: MessageCircle,
    group: 'sales',
  },
  {
    to: '/consumer',
    label: 'Consumer',
    description: 'Quanela Consumer: lo que ven los clientes en la app',
    modules: ['consumer'],
    icon: Store,
    group: 'sales',
  },
  {
    to: '/staff',
    label: 'Personal',
    description: 'Turnos del equipo, asistencia y horas',
    modules: ['staff'],
    icon: CalendarClock,
    group: 'business',
  },
  {
    to: '/insights',
    label: 'Insights',
    description: 'Cómo va el negocio: ventas, costos y rentabilidad',
    modules: ['reports'],
    icon: BarChart3,
    group: 'business',
    matchPrefixes: ['/insights', '/reports'],
  },
  {
    to: '/finance',
    label: 'Finanzas',
    description: 'Lo que se debe, los pagos, el flujo de caja y la rentabilidad real',
    modules: ['finance'],
    icon: Landmark,
    group: 'business',
    matchPrefixes: ['/finance'],
  },
]

/**
 * Administration of the account (ADR 0024), below a divider in the rail:
 * Usuarios (Usuarios · Roles y permisos) and Configuración (General ·
 * Facturación · IA y voz · Integraciones · Actividad). Always this account.
 */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: '/users', label: 'Usuarios', description: 'Usuarios, roles y permisos de esta cuenta', modules: ['users'], icon: UserCog, group: 'admin' },
  {
    to: '/settings',
    label: 'Configuración',
    description: 'General, facturación, IA y voz, integraciones y actividad',
    modules: ['settings'],
    icon: Settings,
    group: 'admin',
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
 * Where each role starts (ADR 0020 D3, ADR 0031), decided by permissions so
 * custom roles follow the same rule:
 *   - rider (delivers, does not see all orders)  → Operación (Despacho)
 *   - kitchen (prepares, does not create orders) → Operación (Cocina)
 *   - cashier (creates orders, does not manage)  → Operación (Tablero)
 *   - everyone else → their first module (Inicio for administration)
 * Inside Operación, the view each one lands on is `defaultOperationsView`.
 */
export function homeSection(can: Can): string {
  const preferred =
    (can('dispatch.deliver') && !can('orders.view')) || (can('kitchen.prepare') && !can('orders.create')) || (can('orders.create') && !can('settings.manage'))
      ? '/operations'
      : null
  if (preferred && isSectionAllowed(preferred, can)) return preferred
  return NAV_ITEMS.find((i) => canAccessAnyModule(can, i.modules))?.to ?? '/perfil'
}

/**
 * The desktop rail fits the window: modules that do not fit go into «Más»,
 * so the bell and the user menu below never fall off screen. Sizes follow
 * the rail's classes (size-11 items, gap-1.5, my-1.5 dividers).
 */
export const RAIL_SIZES = { item: 44, gap: 6, divider: 13 }

function railHeight(items: NavItem[], extraItems = 0): number {
  const dividers = items.filter((item, i) => i > 0 && item.group !== items[i - 1].group).length
  const children = items.length + extraItems + dividers
  if (children === 0) return 0
  return (items.length + extraItems) * RAIL_SIZES.item + dividers * RAIL_SIZES.divider + (children - 1) * RAIL_SIZES.gap
}

/** `available` null = not measured yet (or no layout, as in tests): everything shows. */
export function fitRail(items: NavItem[], available: number | null): { visible: NavItem[]; overflow: NavItem[] } {
  if (available === null || railHeight(items) <= available) return { visible: items, overflow: [] }
  let count = items.length - 1
  // The «Más» button takes one more slot.
  while (count > 0 && railHeight(items.slice(0, count), 1) > available) count--
  return { visible: items.slice(0, count), overflow: items.slice(count) }
}
