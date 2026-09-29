import { Activity, Building2, CreditCard, Layers, LayoutGrid, Settings, Sparkles, Store, Users, type LucideIcon } from 'lucide-react'

/**
 * Secciones del centro de administración (ADR 0012). Cada una exige un
 * permiso de organización; la base lo vuelve a exigir en cada RPC.
 */
export interface OrgNavItem {
  to: string
  label: string
  description: string
  icon: LucideIcon
  /** Basta con uno de estos permisos. */
  permissions: string[]
}

export const ORG_NAV_ITEMS: OrgNavItem[] = [
  { to: '/', label: 'Resumen', description: 'Cómo está operando la organización', icon: LayoutGrid, permissions: ['observability.view'] },
  { to: '/cuentas', label: 'Cuentas', description: 'Todas las cuentas: estado, crear, editar, entrar', icon: Store, permissions: ['accounts.view'] },
  { to: '/observabilidad', label: 'Observabilidad', description: 'Operación por cuenta y bitácora', icon: Activity, permissions: ['observability.view'] },
  { to: '/equipos', label: 'Equipos', description: 'Usuarios, roles y permisos', icon: Users, permissions: ['users.view'] },
  { to: '/facturacion', label: 'Facturación', description: 'Plan, límites, uso y facturas', icon: CreditCard, permissions: ['billing.view'] },
  { to: '/ai', label: 'IA y voz', description: 'Funciones de IA y voz por cuenta, voz de cocina y uso', icon: Sparkles, permissions: ['features.manage'] },
  { to: '/configuracion', label: 'Configuración', description: 'Datos del negocio e integraciones', icon: Settings, permissions: ['organization.manage'] },
  { to: '/menus-maestros', label: 'Menús maestros', description: 'Platos compartidos entre cuentas', icon: Layers, permissions: ['master_menus.manage'] },
]

export const ORG_ADMIN_ICON = Building2

const matches = (section: string, prefix: string) => section === prefix || section.startsWith(`${prefix}/`)

export function isOrgNavItemActive(section: string, item: OrgNavItem): boolean {
  return item.to === '/' ? section === '/' : matches(section, item.to)
}

export function visibleOrgNav(can: (permission: string) => boolean): OrgNavItem[] {
  return ORG_NAV_ITEMS.filter((item) => item.permissions.some(can))
}

/** Primera sección permitida (el Resumen si tiene observabilidad). */
export function orgHomeSection(can: (permission: string) => boolean): string | null {
  return visibleOrgNav(can)[0]?.to ?? null
}

/** ¿Puede abrir esta sección del centro? (UX: la base igual rechaza lo no permitido.) */
export function isOrgSectionAllowed(section: string, can: (permission: string) => boolean): boolean {
  const item = ORG_NAV_ITEMS.find((i) => isOrgNavItemActive(section, i))
  return item ? item.permissions.some(can) : true
}
