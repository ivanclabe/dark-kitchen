import { describe, expect, it } from 'vitest'
import type { AccountPermission, OrganizationPermission } from '@/shared/rbac/permissions'
import type { DashboardSummary } from '../types'
import { alertLink, attentionRows } from './attention'

const summary: DashboardSummary = {
  salesToday: 0,
  salesWeek: 0,
  salesMonth: 0,
  ordersToday: 0,
  ordersWeek: 0,
  ordersMonth: 0,
  avgTicketMonth: 0,
  inventoryValue: 0,
  lowStockCount: 3,
  wasteValueMonth: 0,
  purchasesMonth: 0,
  ordersNuevo: 2,
  ordersConfirmado: 0,
  ordersEnPreparacion: 1,
  ordersListo: 1,
  ordersDespachado: 0,
}

const allowing = (...permissions: string[]) => (p: string) => permissions.includes(p)

describe('Inicio, «Necesita atención» (ADR 0030)', () => {
  it('links each pending thing to its list already filtered', () => {
    const rows = attentionRows(summary, 4, allowing('orders.view', 'kitchen.view', 'inventory.view') as (p: AccountPermission) => boolean)
    expect(rows.map((r) => [r.id, r.value, r.to])).toEqual([
      ['confirm', 2, '/operations?view=list&status=NUEVO&range=all'],
      ['kitchen', 2, '/operations?view=kitchen'],
      ['overdue', 4, '/customers?status=overdue'],
      ['stock', 3, '/supply/stock?filter=low'],
    ])
  })

  it('shows only what the person can open', () => {
    const rows = attentionRows(summary, null, allowing('kitchen.view') as (p: AccountPermission) => boolean)
    expect(rows.map((r) => r.id)).toEqual(['kitchen'])
  })
})

describe('account alerts lead to their cause (ADR 0030)', () => {
  const alert = (type: string) => ({ type, severity: 'warning' as const, message: type })
  const full = {
    can: allowing('kitchen.view', 'inventory.view') as (p: AccountPermission) => boolean,
    canShared: allowing('observability.view', 'billing.view') as (p: OrganizationPermission) => boolean,
  }
  const none = { can: () => false, canShared: () => false }

  it('by type', () => {
    expect(alertLink(alert('late_orders'), full)).toBe('/operations?view=kitchen')
    expect(alertLink(alert('low_stock'), full)).toBe('/supply/stock?filter=low')
    expect(alertLink(alert('ai_errors'), full)).toBe('/settings/ai?tab=usage')
    expect(alertLink(alert('ai_quota'), full)).toBe('/settings/ai?tab=usage')
    expect(alertLink(alert('trial'), full)).toBe('/settings/billing')
    expect(alertLink(alert('plan_limit'), full)).toBe('/settings/billing')
    expect(alertLink(alert('something_new'), full)).toBeNull()
  })

  it('never towards a screen the person cannot open', () => {
    for (const type of ['late_orders', 'low_stock', 'ai_errors', 'trial']) expect(alertLink(alert(type), none)).toBeNull()
  })
})
