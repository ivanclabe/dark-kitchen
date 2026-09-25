import { describe, expect, it } from 'vitest'
import type { PermissionDef } from '../api/organization'
import { actionLabel, groupCatalog } from './permissionCatalog'

const perm = (key: string, sortOrder: number, label = key): PermissionDef => {
  const [module, action] = key.split('.')
  return { key, module, action, label, description: null, sortOrder }
}

describe('groupCatalog', () => {
  it('agrupa por módulo en el orden del catálogo', () => {
    const groups = groupCatalog([perm('orders.cancel', 34), perm('dashboard.view', 10), perm('orders.view', 30), perm('nuevo.view', 999, 'Algo nuevo')])
    expect(groups.map((g) => g.module)).toEqual(['dashboard', 'orders', 'nuevo'])
    expect(groups[1].permissions.map((p) => p.action)).toEqual(['view', 'cancel'])
    expect(groups[1].label).toBe('Pedidos')
    expect(groups[2].label).toBe('nuevo')
  })

  it('usa un texto corto por acción y, si no lo conoce, el nombre del permiso', () => {
    expect(actionLabel(perm('orders.confirm', 1))).toBe('Confirmar')
    expect(actionLabel(perm('x.teleport', 1, 'Teletransportar'))).toBe('Teletransportar')
  })
})
