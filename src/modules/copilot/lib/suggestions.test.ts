import type { AccountPermission, Can } from '@/shared/rbac/roles'
import { describe, expect, it } from 'vitest'
import { suggestionsFor } from './suggestions'

const can =
  (...perms: AccountPermission[]): Can =>
  (p) =>
    perms.includes(p)

describe('Copilot suggestions', () => {
  it('only offers what the role can ask', () => {
    const kitchen = suggestionsFor(can('copilot.use', 'kitchen.view', 'products.view'), '/kitchen', 10)
    expect(kitchen.some((s) => s.includes('vendimos'))).toBe(false)
    expect(kitchen[0]).toContain('tiempos de cocina')
  })

  it('puts the questions of the current screen first', () => {
    const admin = can('copilot.use', 'reports.view', 'orders.view', 'customers.view', 'receivables.view', 'inventory.view')
    expect(suggestionsFor(admin, '/customers')[0]).toContain('clientes')
    expect(suggestionsFor(admin, '/orders/123')[0]).toContain('pedidos')
  })

  it('limits the list', () => {
    expect(suggestionsFor(() => true, '/', 4)).toHaveLength(4)
  })
})
