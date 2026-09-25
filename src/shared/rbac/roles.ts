// Desde multi-cocina (ADR 0007) el rol de una persona es POR CUENTA
// (dk_kitchen_members → dk_roles) y sus permisos, claves del catálogo central
// (ADR 0008), se leen de la base (dk_my_kitchens).
import type { AccountPermission } from './permissions'

export type { AccountPermission, PermissionKey } from './permissions'

export type ModuleKey =
  | 'dashboard'
  | 'users'
  | 'supply'
  | 'menuPlanner'
  | 'kitchen'
  | 'customers'
  | 'reports'
  | 'settings'

/** ¿Tiene el usuario este permiso (clave del catálogo, p. ej. 'orders.confirm') en la Cuenta activa? */
export type Can = (permission: AccountPermission) => boolean

/**
 * Qué permiso (cualquiera de la lista) abre cada módulo de la app. Los
 * permisos vienen de la base, por rol y por Cocina (dk_my_kitchens); esto
 * solo traduce "módulo de la app" → "permisos que lo habilitan". Es UX: la
 * autoridad real es la RLS de cada tabla.
 */
const MODULE_PERMISSIONS: Record<ModuleKey, readonly AccountPermission[]> = {
  dashboard: ['dashboard.view'],
  // Usuarios y permisos: quien ve el equipo (el SUPER_ADMIN tiene todo).
  users: ['team.view', 'team.manage'],
  // Stock, compras y proveedores.
  supply: ['inventory.view', 'purchasing.view', 'suppliers.view'],
  // Platos, calendario y recetas.
  menuPlanner: ['menus.view'],
  // Tablero: pedidos, preparación y despacho.
  kitchen: ['kitchen.view'],
  customers: ['customers.view'],
  reports: ['reports.view'],
  // Configuración de la Cuenta (datos generales, IA).
  settings: ['settings.manage', 'ai.manage'],
}

export function canAccessModule(can: Can, module: ModuleKey): boolean {
  return MODULE_PERMISSIONS[module].some((permission) => can(permission))
}

/** true si puede entrar a al menos uno de los módulos — para ítems del sidebar que agrupan varias rutas. */
export function canAccessAnyModule(can: Can, modules: readonly ModuleKey[]): boolean {
  return modules.some((m) => canAccessModule(can, m))
}

/**
 * Nombre de rol en MAYÚSCULAS y con "_" en vez de espacios (misma regla que
 * dk_normalize_role_name en la base): "Encargado de turno" → ENCARGADO_DE_TURNO.
 * `trailing` conserva un "_" final mientras se escribe.
 */
export function normalizeRoleName(value: string, { trailing = false }: { trailing?: boolean } = {}): string {
  const cleaned = value.replace(/[^\p{L}\p{N}\s_]+/gu, '').toUpperCase()
  const joined = trailing ? cleaned.replace(/^\s+/, '').replace(/\s+/g, '_') : cleaned.trim().replace(/\s+/g, '_')
  return joined
}
