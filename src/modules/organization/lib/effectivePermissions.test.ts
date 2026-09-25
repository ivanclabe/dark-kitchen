import { describe, expect, it } from 'vitest'
import type { OrgRole } from '../api/organization'
import { canGrantRole, maxPermissions } from './effectivePermissions'

const role = (id: string, permissions: string[]): OrgRole => ({ id, key: id.toUpperCase(), name: id, description: null, isSystem: false, permissions })
const roles = [role('cocina', ['kitchen.view', 'orders.view']), role('despacho', ['orders.view', 'dispatch.assign'])]

describe('permisos efectivos', () => {
  it('el máximo posible en una Cuenta es la unión de sus roles', () => {
    expect([...maxPermissions(roles, { roleIds: ['cocina', 'despacho'] })].sort()).toEqual(['dispatch.assign', 'kitchen.view', 'orders.view'])
    expect(maxPermissions(roles, { roleIds: [] }).size).toBe(0)
  })

  it('solo se ofrece dar roles cuyos permisos tiene quien asigna (salvo el SUPER_ADMIN)', () => {
    const mine = new Set(['kitchen.view', 'orders.view', 'team.manage'])
    expect(canGrantRole(roles[0], mine, false)).toBe(true)
    expect(canGrantRole(roles[1], mine, false)).toBe(false)
    expect(canGrantRole(roles[1], mine, true)).toBe(true)
  })
})
