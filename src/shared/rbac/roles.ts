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
  | 'inventory'
  | 'suppliers'
  | 'purchases'
  | 'recipes'
  | 'products'
  | 'menus'
  | 'orders'
  | 'kitchen'
  | 'delivery'
  | 'customers'
  | 'reports'

// Which roles can even see/enter a module. Fine-grained read/write is
// enforced per-action closer to each service call, not just per module.
const MODULE_ACCESS: Record<ModuleKey, readonly Role[]> = {
  dashboard: ['ADMIN', 'MANAGER', 'INVENTORY', 'CASHIER'],
  users: ['ADMIN'],
  inventory: ['ADMIN', 'MANAGER', 'INVENTORY'],
  suppliers: ['ADMIN', 'MANAGER', 'INVENTORY'],
  purchases: ['ADMIN', 'MANAGER', 'INVENTORY'],
  recipes: ['ADMIN', 'MANAGER', 'INVENTORY', 'KITCHEN'],
  products: ['ADMIN', 'MANAGER', 'INVENTORY', 'KITCHEN', 'CASHIER'],
  menus: ['ADMIN', 'MANAGER', 'KITCHEN', 'CASHIER'],
  orders: ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN', 'DELIVERY'],
  kitchen: ['ADMIN', 'MANAGER', 'KITCHEN'],
  delivery: ['ADMIN', 'MANAGER', 'CASHIER', 'DELIVERY'],
  customers: ['ADMIN', 'MANAGER', 'CASHIER'],
  reports: ['ADMIN', 'MANAGER', 'INVENTORY', 'CASHIER'],
}

export function canAccessModule(role: Role | null, module: ModuleKey): boolean {
  if (!role) return false
  return MODULE_ACCESS[module].includes(role)
}
