import { describe, expect, it } from 'vitest'
import { slugError, slugify } from './slug'

describe('slugify', () => {
  it('convierte nombres con tildes, eñes y espacios', () => {
    expect(slugify('Hamburguesería Centro')).toBe('hamburgueseria-centro')
    expect(slugify('  Cocina Ñoña #2 ')).toBe('cocina-nona-2')
  })
})

describe('slugError', () => {
  it('acepta el formato de la base', () => {
    expect(slugError('dark-kitchen-1')).toBeNull()
  })
  it('rechaza lo que la base rechazaría', () => {
    expect(slugError('ab')).not.toBeNull()
    expect(slugError('Con Mayúsculas')).not.toBeNull()
    expect(slugError('doble--guion')).not.toBeNull()
    expect(slugError('-inicio')).not.toBeNull()
  })
})
