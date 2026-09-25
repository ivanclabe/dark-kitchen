import { describe, expect, it } from 'vitest'
import type { AccountPermission, Can } from '@/shared/rbac/roles'
import { canTransition, isForward, nextStatus, prevStatus, transitionAction } from './transitions'


// Permisos de operación de las plantillas del sistema (catálogo, ADR 0008).
const ROLE_PERMISSIONS: Record<string, AccountPermission[]> = {
  ADMIN: ['orders.create', 'orders.confirm', 'orders.cancel', 'kitchen.prepare', 'kitchen.prioritize', 'dispatch.assign', 'dispatch.deliver'],
  MANAGER: ['orders.create', 'orders.confirm', 'orders.cancel', 'kitchen.prepare', 'kitchen.prioritize', 'dispatch.assign', 'dispatch.deliver'],
  CASHIER: ['orders.create', 'orders.confirm', 'orders.cancel', 'dispatch.assign', 'dispatch.deliver'],
  KITCHEN: ['orders.cancel', 'kitchen.prepare', 'kitchen.prioritize'],
  DELIVERY: ['dispatch.deliver'],
}
const perms =
  (role: string): Can =>
  (permission) =>
    ROLE_PERMISSIONS[role].includes(permission)

describe('nextStatus', () => {
  it('NUEVO avanza a CONFIRMADO', () => {
    expect(nextStatus('NUEVO')).toBe('CONFIRMADO')
  })

  it('CONFIRMADO avanza a EN_PREPARACION', () => {
    expect(nextStatus('CONFIRMADO')).toBe('EN_PREPARACION')
  })

  it('EN_PREPARACION avanza a LISTO', () => {
    expect(nextStatus('EN_PREPARACION')).toBe('LISTO')
  })

  it('LISTO avanza a DESPACHADO (el flujo sigue hasta el reparto)', () => {
    expect(nextStatus('LISTO')).toBe('DESPACHADO')
  })

  it('DESPACHADO no tiene siguiente columna (se entrega y sale del tablero)', () => {
    expect(nextStatus('DESPACHADO')).toBeNull()
  })

  it('CANCELADO no tiene siguiente paso (terminal)', () => {
    expect(nextStatus('CANCELADO')).toBeNull()
  })
})

describe('prevStatus', () => {
  it('LISTO retrocede a EN_PREPARACION', () => {
    expect(prevStatus('LISTO')).toBe('EN_PREPARACION')
  })

  it('EN_PREPARACION retrocede a CONFIRMADO', () => {
    expect(prevStatus('EN_PREPARACION')).toBe('CONFIRMADO')
  })

  it('CONFIRMADO no vuelve a NUEVO (no existe "desconfirmar")', () => {
    expect(prevStatus('CONFIRMADO')).toBeNull()
  })

  it('DESPACHADO no vuelve a LISTO (no existe "desdespachar")', () => {
    expect(prevStatus('DESPACHADO')).toBeNull()
  })

  it('NUEVO y CANCELADO no tienen paso anterior', () => {
    expect(prevStatus('NUEVO')).toBeNull()
    expect(prevStatus('CANCELADO')).toBeNull()
  })
})

describe('transitionAction', () => {
  it('NUEVO -> CONFIRMADO es confirmar', () => {
    expect(transitionAction('NUEVO', 'CONFIRMADO')).toBe('confirm')
  })

  it('NUEVO no puede saltar a preparación sin confirmar', () => {
    expect(transitionAction('NUEVO', 'EN_PREPARACION')).toBeNull()
    expect(transitionAction('NUEVO', 'LISTO')).toBeNull()
  })

  it('dentro de cocina, adelante es avanzar y atrás es retroceder', () => {
    expect(transitionAction('CONFIRMADO', 'LISTO')).toBe('advance')
    expect(transitionAction('LISTO', 'CONFIRMADO')).toBe('revert')
  })

  it('solo LISTO se despacha', () => {
    expect(transitionAction('LISTO', 'DESPACHADO')).toBe('dispatch')
    expect(transitionAction('EN_PREPARACION', 'DESPACHADO')).toBeNull()
    expect(transitionAction('CONFIRMADO', 'DESPACHADO')).toBeNull()
  })

  it('cualquier estado activo se puede cancelar', () => {
    for (const from of ['NUEVO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO'] as const) {
      expect(transitionAction(from, 'CANCELADO')).toBe('cancel')
    }
  })

  it('nada sale de DESPACHADO salvo cancelar', () => {
    expect(transitionAction('DESPACHADO', 'LISTO')).toBeNull()
    expect(transitionAction('DESPACHADO', 'CONFIRMADO')).toBeNull()
  })

  it('nada vuelve a NUEVO', () => {
    expect(transitionAction('CONFIRMADO', 'NUEVO')).toBeNull()
  })
})

describe('canTransition', () => {
  it('permite avanzar CONFIRMADO -> EN_PREPARACION', () => {
    expect(canTransition('CONFIRMADO', 'EN_PREPARACION')).toBe(true)
  })

  it('permite saltar CONFIRMADO -> LISTO directo', () => {
    expect(canTransition('CONFIRMADO', 'LISTO')).toBe(true)
  })

  it('permite retroceder LISTO -> EN_PREPARACION', () => {
    expect(canTransition('LISTO', 'EN_PREPARACION')).toBe(true)
  })

  it('permite saltar hacia atrás LISTO -> CONFIRMADO directo', () => {
    expect(canTransition('LISTO', 'CONFIRMADO')).toBe(true)
  })

  it('rechaza soltar en la misma columna', () => {
    expect(canTransition('EN_PREPARACION', 'EN_PREPARACION')).toBe(false)
  })

  it('rechaza mover un pedido fuera de CANCELADO (terminal)', () => {
    expect(canTransition('CANCELADO', 'CONFIRMADO')).toBe(false)
    expect(canTransition('CANCELADO', 'NUEVO')).toBe(false)
    expect(canTransition('CANCELADO', 'CANCELADO')).toBe(false)
  })

  describe('con los permisos de cada rol', () => {
    it('KITCHEN prepara pero no confirma ni despacha', () => {
      expect(canTransition('CONFIRMADO', 'EN_PREPARACION', perms('KITCHEN'))).toBe(true)
      expect(canTransition('NUEVO', 'CONFIRMADO', perms('KITCHEN'))).toBe(false)
      expect(canTransition('LISTO', 'DESPACHADO', perms('KITCHEN'))).toBe(false)
    })

    it('CASHIER confirma y despacha pero no prepara', () => {
      expect(canTransition('NUEVO', 'CONFIRMADO', perms('CASHIER'))).toBe(true)
      expect(canTransition('LISTO', 'DESPACHADO', perms('CASHIER'))).toBe(true)
      expect(canTransition('CONFIRMADO', 'EN_PREPARACION', perms('CASHIER'))).toBe(false)
    })

    it('DELIVERY no mueve columnas ni cancela', () => {
      expect(canTransition('LISTO', 'DESPACHADO', perms('DELIVERY'))).toBe(false)
      expect(canTransition('DESPACHADO', 'CANCELADO', perms('DELIVERY'))).toBe(false)
    })

    it('ADMIN y MANAGER pueden todo lo que el flujo permite', () => {
      for (const role of ['ADMIN', 'MANAGER'] as const) {
        expect(canTransition('NUEVO', 'CONFIRMADO', perms(role))).toBe(true)
        expect(canTransition('CONFIRMADO', 'LISTO', perms(role))).toBe(true)
        expect(canTransition('LISTO', 'DESPACHADO', perms(role))).toBe(true)
        expect(canTransition('DESPACHADO', 'CANCELADO', perms(role))).toBe(true)
      }
    })

    it('sin rol (sesión sin perfil) no se permite nada', () => {
      expect(canTransition('CONFIRMADO', 'EN_PREPARACION', null)).toBe(false)
    })
  })
})

describe('isForward', () => {
  it('CONFIRMADO -> LISTO es hacia adelante', () => {
    expect(isForward('CONFIRMADO', 'LISTO')).toBe(true)
  })

  it('LISTO -> CONFIRMADO es hacia atrás', () => {
    expect(isForward('LISTO', 'CONFIRMADO')).toBe(false)
  })

  it('NUEVO -> DESPACHADO es hacia adelante', () => {
    expect(isForward('NUEVO', 'DESPACHADO')).toBe(true)
  })

  it('CANCELADO nunca es "hacia adelante"', () => {
    expect(isForward('LISTO', 'CANCELADO')).toBe(false)
  })
})
