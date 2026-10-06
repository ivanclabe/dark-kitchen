import type { AccountAlert } from '@/modules/settings/api'
import type { Can } from '@/shared/rbac/roles'
import type { ActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import type { DashboardSummary } from '../types'

export interface AttentionRow {
  id: 'confirm' | 'kitchen' | 'overdue' | 'stock'
  label: string
  value: number
  to: string
}

/**
 * «Necesita atención» de Inicio (ADR 0030): what is pending today, each row
 * opening the list already filtered. Only the rows the person can open;
 * `overdueCustomers` is null when they cannot see balances.
 */
export function attentionRows(summary: DashboardSummary, overdueCustomers: number | null, can: Can): AttentionRow[] {
  const rows: (AttentionRow & { show: boolean })[] = [
    { id: 'confirm', label: 'Pedidos por confirmar', value: summary.ordersNuevo, to: '/operations?view=list&status=NUEVO&range=all', show: can('orders.view') },
    { id: 'kitchen', label: 'Preparando o listos para despachar', value: summary.ordersEnPreparacion + summary.ordersListo, to: '/operations?view=kitchen', show: can('kitchen.view') },
    { id: 'overdue', label: 'Clientes con saldo vencido', value: overdueCustomers ?? 0, to: '/customers?status=overdue', show: overdueCustomers !== null },
    { id: 'stock', label: 'Insumos bajo el mínimo', value: summary.lowStockCount, to: '/supply/stock?filter=low', show: can('inventory.view') },
  ]
  return rows.filter((r) => r.show).map(({ show: _show, ...row }) => row)
}

/** Where each account alert leads (ADR 0030), only where the person can go. */
export function alertLink(alert: AccountAlert, { can, canShared }: Pick<ActiveKitchen, 'can' | 'canShared'>): string | null {
  switch (alert.type) {
    case 'late_orders':
      return can('kitchen.view') ? '/operations?view=kitchen' : null
    case 'low_stock':
      return can('inventory.view') ? '/supply/stock?filter=low' : null
    case 'ai_errors':
    case 'ai_quota':
      return canShared('features.manage') || canShared('observability.view') ? '/settings/ai?tab=usage' : null
    case 'trial':
    case 'plan_limit':
      return canShared('billing.view') ? '/settings/billing' : null
    default:
      return null
  }
}
