import { describe, expect, it } from 'vitest'
import type { Can } from '@/shared/rbac/roles'
import { defaultOperationsView, operationsViews, resolveOperationsView } from './views'

const can = (...permissions: string[]): Can => ((p: string) => permissions.includes(p)) as Can

// The permissions of the system roles that matter here (unchanged by ADR 0031).
const CAJA = can('orders.view', 'orders.create', 'kitchen.view', 'dispatch.view', 'dispatch.assign', 'dispatch.deliver', 'receivables.view', 'receivables.collect')
const COCINA = can('kitchen.view', 'kitchen.prepare', 'kitchen.prioritize', 'orders.view', 'orders.cancel')
const DOMICILIARIO = can('dispatch.view', 'dispatch.deliver')
const ADMIN = can('orders.view', 'orders.create', 'kitchen.view', 'kitchen.prepare', 'dispatch.view', 'dispatch.assign', 'settings.manage')

describe('Centro de operaciones: views by role (ADR 0031)', () => {
  it('Caja and Admin see the four views, Tablero first', () => {
    expect(operationsViews(CAJA)).toEqual(['board', 'kitchen', 'dispatch', 'list'])
    expect(defaultOperationsView(CAJA)).toBe('board')
    expect(defaultOperationsView(ADMIN)).toBe('board')
  })

  it('the line lands on Cocina (it sees the orders, it does not create them)', () => {
    expect(operationsViews(COCINA)).toEqual(['board', 'kitchen', 'list'])
    expect(defaultOperationsView(COCINA)).toBe('kitchen')
  })

  it('a role that only prepares has only Cocina (no tabs)', () => {
    expect(operationsViews(can('kitchen.view', 'kitchen.prepare'))).toEqual(['kitchen'])
  })

  it('the rider has only Despacho', () => {
    expect(operationsViews(DOMICILIARIO)).toEqual(['dispatch'])
    expect(defaultOperationsView(DOMICILIARIO)).toBe('dispatch')
  })

  it('a view the role cannot open falls back to its default', () => {
    expect(resolveOperationsView(DOMICILIARIO, 'list')).toBe('dispatch')
    expect(resolveOperationsView(CAJA, 'list')).toBe('list')
    expect(resolveOperationsView(can('dashboard.view'), 'board')).toBeNull()
  })
})
