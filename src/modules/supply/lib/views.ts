import type { Can } from '@/shared/rbac/roles'

export type SupplyView = 'stock' | 'preparaciones' | 'compras' | 'proveedores'

export const SUPPLY_VIEWS: { value: SupplyView; label: string }[] = [
  { value: 'stock', label: 'Stock' },
  // ADR 0057: sub-recipes made in batches.
  { value: 'preparaciones', label: 'Preparaciones' },
  { value: 'compras', label: 'Compras' },
  { value: 'proveedores', label: 'Proveedores' },
]

/** Who sees each section: the kitchen (inventory.produce) only sees Preparaciones. */
const VIEW_PERMISSIONS: Record<SupplyView, Parameters<Can>[0][]> = {
  stock: ['inventory.view'],
  preparaciones: ['inventory.view', 'inventory.produce', 'recipes.view'],
  compras: ['purchasing.view'],
  proveedores: ['suppliers.view'],
}

/** The sections of Abastecimiento this role can open (the page and the sidebar, ADR 0072). */
export function supplyViews(can: Can) {
  return SUPPLY_VIEWS.filter((v) => VIEW_PERMISSIONS[v.value].some((p) => can(p)))
}
