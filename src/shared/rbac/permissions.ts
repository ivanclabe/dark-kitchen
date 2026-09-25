/**
 * Claves del catálogo central de permisos (ADR 0008, sección 4). La fuente
 * de verdad es `dk_permissions` en la base (migración
 * 20260925110000_dk_permission_catalog.sql). Esta lista existe para que el
 * compilador rechace una clave mal escrita en `can('…')`; la prueba
 * `permissions.test.ts` verifica que sea idéntica a la que la suite SQL
 * compara contra la base.
 */
export const ACCOUNT_PERMISSION_KEYS = [
  'dashboard.view',
  'kitchen.view',
  'kitchen.prepare',
  'kitchen.prioritize',
  'orders.view',
  'orders.create',
  'orders.edit',
  'orders.confirm',
  'orders.cancel',
  'dispatch.view',
  'dispatch.assign',
  'dispatch.deliver',
  'dispatch.riders',
  'customers.view',
  'customers.create',
  'customers.edit',
  'customers.delete',
  'receivables.view',
  'receivables.collect',
  'menus.view',
  'menus.edit',
  'menus.manage',
  'products.view',
  'products.create',
  'products.edit',
  'recipes.view',
  'recipes.edit',
  'inventory.view',
  'inventory.create',
  'inventory.edit',
  'inventory.delete',
  'inventory.adjust',
  'purchasing.view',
  'purchasing.create',
  'purchasing.confirm',
  'suppliers.view',
  'suppliers.edit',
  'invoices.view',
  'invoices.upload',
  'reports.view',
  'reports.profitability',
  'ai.manage',
  'settings.view',
  'settings.manage',
  'team.view',
  'team.manage',
  'audit.view',
] as const

export const ORGANIZATION_PERMISSION_KEYS = [
  'organization.view',
  'organization.manage',
  'accounts.view',
  'accounts.create',
  'accounts.manage',
  'users.view',
  'users.manage',
  'roles.manage',
  'master_menus.manage',
  'features.manage',
] as const

export type AccountPermission = (typeof ACCOUNT_PERMISSION_KEYS)[number]
export type OrganizationPermission = (typeof ORGANIZATION_PERMISSION_KEYS)[number]
export type PermissionKey = AccountPermission | OrganizationPermission
