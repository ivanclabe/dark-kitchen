import { describe, expect, it } from 'vitest'
import { normalizeRoleName } from './roles'

describe('nombres de rol', () => {
  it('quedan en MAYÚSCULAS con "_" en vez de espacios', () => {
    expect(normalizeRoleName('Encargado de turno')).toBe('ENCARGADO_DE_TURNO')
    expect(normalizeRoleName('  cocina  norte ')).toBe('COCINA_NORTE')
    expect(normalizeRoleName('Jefe de área')).toBe('JEFE_DE_ÁREA')
    expect(normalizeRoleName('caja/despacho!')).toBe('CAJADESPACHO')
  })

  it('mientras se escribe conserva el "_" del espacio recién tecleado', () => {
    expect(normalizeRoleName('Encargado ', { trailing: true })).toBe('ENCARGADO_')
  })
})
