import type { Can } from '@/shared/rbac/roles'

/**
 * Centro de operaciones (ADR 0031): the same orders, four views. Each one is
 * offered by the permissions that already existed for Pedidos and Cocina.
 */
export type OperationsView = 'board' | 'kitchen' | 'dispatch' | 'list'

export const OPERATIONS_VIEW_LABEL: Record<OperationsView, string> = {
  board: 'Tablero',
  kitchen: 'Cocina',
  dispatch: 'Despacho',
  list: 'Lista',
}

/** The views this role can open, in the order of the flow. */
export function operationsViews(can: Can): OperationsView[] {
  const views: OperationsView[] = []
  if (can('orders.view')) views.push('board')
  if (can('kitchen.view')) views.push('kitchen')
  if (can('dispatch.view') || can('dispatch.assign')) views.push('dispatch')
  if (can('orders.view')) views.push('list')
  return views
}

/**
 * Where each role starts inside Operación (ADR 0020 D3, kept): the line
 * (prepares, does not create orders) → Cocina; a rider → Despacho; the rest → Tablero.
 */
export function defaultOperationsView(can: Can): OperationsView | null {
  const views = operationsViews(can)
  const preferred: OperationsView | null =
    can('kitchen.prepare') && !can('orders.create') ? 'kitchen' : can('dispatch.deliver') && !can('orders.view') ? 'dispatch' : null
  if (preferred && views.includes(preferred)) return preferred
  return views[0] ?? null
}

/** The view asked for in the address, when the role can open it; otherwise its default. */
export function resolveOperationsView(can: Can, requested: string | null): OperationsView | null {
  const views = operationsViews(can)
  return views.find((v) => v === requested) ?? defaultOperationsView(can)
}
