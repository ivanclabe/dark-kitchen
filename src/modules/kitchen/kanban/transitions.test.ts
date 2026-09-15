import { describe, expect, it } from 'vitest'
import { canTransition, isForward, nextStatus, prevStatus } from './transitions'

describe('nextStatus', () => {
  it('CONFIRMADO avanza a EN_PREPARACION', () => {
    expect(nextStatus('CONFIRMADO')).toBe('EN_PREPARACION')
  })

  it('EN_PREPARACION avanza a LISTO', () => {
    expect(nextStatus('EN_PREPARACION')).toBe('LISTO')
  })

  it('LISTO no tiene siguiente paso dentro de Cocina', () => {
    expect(nextStatus('LISTO')).toBeNull()
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

  it('CONFIRMADO no tiene paso anterior', () => {
    expect(prevStatus('CONFIRMADO')).toBeNull()
  })

  it('CANCELADO no tiene paso anterior (terminal)', () => {
    expect(prevStatus('CANCELADO')).toBeNull()
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

  it('permite retroceder EN_PREPARACION -> CONFIRMADO', () => {
    expect(canTransition('EN_PREPARACION', 'CONFIRMADO')).toBe(true)
  })

  it('permite saltar hacia atrás LISTO -> CONFIRMADO directo', () => {
    expect(canTransition('LISTO', 'CONFIRMADO')).toBe(true)
  })

  it('rechaza soltar en la misma columna', () => {
    expect(canTransition('EN_PREPARACION', 'EN_PREPARACION')).toBe(false)
  })

  it('permite cancelar desde CONFIRMADO', () => {
    expect(canTransition('CONFIRMADO', 'CANCELADO')).toBe(true)
  })

  it('permite cancelar desde EN_PREPARACION', () => {
    expect(canTransition('EN_PREPARACION', 'CANCELADO')).toBe(true)
  })

  it('permite cancelar desde LISTO', () => {
    expect(canTransition('LISTO', 'CANCELADO')).toBe(true)
  })

  it('rechaza mover un pedido fuera de CANCELADO (terminal)', () => {
    expect(canTransition('CANCELADO', 'CONFIRMADO')).toBe(false)
    expect(canTransition('CANCELADO', 'EN_PREPARACION')).toBe(false)
    expect(canTransition('CANCELADO', 'LISTO')).toBe(false)
  })

  it('rechaza cancelar un pedido ya cancelado', () => {
    expect(canTransition('CANCELADO', 'CANCELADO')).toBe(false)
  })
})

describe('isForward', () => {
  it('CONFIRMADO -> LISTO es hacia adelante', () => {
    expect(isForward('CONFIRMADO', 'LISTO')).toBe(true)
  })

  it('LISTO -> CONFIRMADO es hacia atrás', () => {
    expect(isForward('LISTO', 'CONFIRMADO')).toBe(false)
  })
})
