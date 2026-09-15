import { describe, expect, it } from 'vitest'
import { isForwardTransition, nextStatus } from './transitions'

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
})

describe('isForwardTransition', () => {
  it('permite CONFIRMADO -> EN_PREPARACION', () => {
    expect(isForwardTransition('CONFIRMADO', 'EN_PREPARACION')).toBe(true)
  })

  it('permite saltar CONFIRMADO -> LISTO directo', () => {
    expect(isForwardTransition('CONFIRMADO', 'LISTO')).toBe(true)
  })

  it('permite EN_PREPARACION -> LISTO', () => {
    expect(isForwardTransition('EN_PREPARACION', 'LISTO')).toBe(true)
  })

  it('rechaza soltar en la misma columna', () => {
    expect(isForwardTransition('EN_PREPARACION', 'EN_PREPARACION')).toBe(false)
  })

  it('rechaza retroceder EN_PREPARACION -> CONFIRMADO', () => {
    expect(isForwardTransition('EN_PREPARACION', 'CONFIRMADO')).toBe(false)
  })

  it('rechaza retroceder LISTO -> CONFIRMADO', () => {
    expect(isForwardTransition('LISTO', 'CONFIRMADO')).toBe(false)
  })
})
