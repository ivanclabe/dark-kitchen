// Mirrors the DB enum `dk_role` (docs/01-database-erd.md) and the permission
// matrix in docs/adr/0005-rls-strategy.md. This is a UX mirror only — RLS and
// the RPC functions in Postgres are the real source of authorization.
export const ROLES = [
  'ADMIN',
  'MANAGER',
  'KITCHEN',
  'INVENTORY',
  'CASHIER',
  'DELIVERY',
] as const

export type Role = (typeof ROLES)[number]

export type ModuleKey =
  | 'dashboard'
  | 'users'
  | 'supply'
  | 'menuPlanner'
  | 'kitchen'
  | 'customers'
  | 'reports'
  | 'settings'

// Which roles can even see/enter a module. Fine-grained read/write is
// enforced per-action closer to each service call, not just per module.
const MODULE_ACCESS: Record<ModuleKey, readonly Role[]> = {
  dashboard: ['ADMIN', 'MANAGER', 'INVENTORY', 'CASHIER'],
  users: ['ADMIN'],
  // Stock (insumos + movimientos), compras y proveedores fusionados — mismos
  // roles que tenían los tres ModuleKey separados que reemplaza.
  supply: ['ADMIN', 'MANAGER', 'INVENTORY'],
  // Platos, calendario de disponibilidad y recetas — reemplaza los antiguos
  // módulos separados 'products'/'menus'/'recipes' (unión de sus roles).
  menuPlanner: ['ADMIN', 'MANAGER', 'INVENTORY', 'KITCHEN', 'CASHIER'],
  // Cocina = Pedidos + Cola + Despacho fusionados: la unión de los tres
  // ModuleKey anteriores. Cada acción del tablero se sigue limitando por rol
  // (ver kitchen/lib/permissions.ts, espejo de los chequeos de cada RPC).
  kitchen: ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN', 'DELIVERY'],
  // Clientes + cuentas por cobrar fusionadas — dk_register_payment y la vista
  // dk_receivables ya aplican este mismo filtro de rol del lado de Postgres
  // (ver migración dk_cartera_schema).
  customers: ['ADMIN', 'MANAGER', 'CASHIER'],
  reports: ['ADMIN', 'MANAGER', 'INVENTORY', 'CASHIER'],
  // Configuración del sistema (hoy: funciones de IA). Escribir dk_ai_features
  // solo lo permite la RLS a ADMIN/MANAGER.
  settings: ['ADMIN', 'MANAGER'],
}

/** true si el rol puede acceder a al menos uno de los módulos dados — usado para los ítems de sidebar que agrupan varias rutas. */
export function canAccessAnyModule(role: Role | null, modules: readonly ModuleKey[]): boolean {
  return modules.some((m) => canAccessModule(role, m))
}

export function canAccessModule(role: Role | null, module: ModuleKey): boolean {
  if (!role) return false
  return MODULE_ACCESS[module].includes(role)
}
