import { canAccessAnyModule, type Can, type ModuleKey } from '@/shared/rbac/roles'
import { BarChart3, ChefHat, LayoutDashboard, Soup, Users, Warehouse, type LucideIcon } from 'lucide-react'

/**
 * Módulos de operación del rail (13 -> 6 ítems, ver auditoría de
 * navegación): cada entrada apunta a su ruta "principal" pero se resalta en
 * cualquiera de `matchPrefixes`. Es visible si el rol activo tiene acceso a
 * AL MENOS UNO de `modules`. Usuarios y permisos, Configuración y Mi perfil
 * viven en el menú de usuario (ADR 0008).
 */
export interface NavItem {
  to: string
  label: string
  description: string
  modules: ModuleKey[]
  icon: LucideIcon
  matchPrefixes?: string[]
  highlight?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', description: 'Resumen del negocio', modules: ['dashboard'], icon: LayoutDashboard },
  {
    to: '/kitchen',
    label: 'Cocina',
    description: 'Del pedido a la entrega, en un tablero',
    modules: ['kitchen'],
    icon: ChefHat,
    matchPrefixes: ['/kitchen', '/orders', '/delivery'],
    highlight: true,
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
  { to: '/reports', label: 'Reportes', description: 'Ventas, compras y rentabilidad', modules: ['reports'], icon: BarChart3 },
]

/** Secciones fuera del rail que también exigen un módulo. */
const EXTRA_SECTIONS: { prefix: string; modules: ModuleKey[] }[] = [
  { prefix: '/settings', modules: ['settings'] },
  { prefix: '/users', modules: ['users'] },
]

const matches = (section: string, prefix: string) => section === prefix || section.startsWith(`${prefix}/`)

/** `section` = la ruta dentro de la Cuenta activa ('/', '/kitchen', '/supply/compras'…). */
export function isNavItemActive(section: string, item: NavItem): boolean {
  if (item.to === '/') return section === '/'
  return (item.matchPrefixes ?? [item.to]).some((p) => matches(section, p))
}

/**
 * ¿Puede el rol activo abrir esta sección? Es UX (la base igual rechaza lo
 * no permitido): evita pantallas con "No autorizado" al entrar por un
 * enlace o al cambiar a un rol con menos permisos. Lo que no pertenece a
 * ningún módulo (p. ej. /perfil) siempre se permite.
 */
export function isSectionAllowed(section: string, can: Can): boolean {
  const item = NAV_ITEMS.find((i) => isNavItemActive(section, i))
  if (item) return canAccessAnyModule(can, item.modules)
  const extra = EXTRA_SECTIONS.find((e) => matches(section, e.prefix))
  return extra ? canAccessAnyModule(can, extra.modules) : true
}

/** Inicio de la Cuenta para este rol: el Dashboard o, si no lo tiene, su primer módulo (Cocina → el tablero). */
export function homeSection(can: Can): string {
  return NAV_ITEMS.find((i) => canAccessAnyModule(can, i.modules))?.to ?? '/perfil'
}
