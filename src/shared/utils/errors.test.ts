import { describe, expect, it } from 'vitest'
import { getErrorMessage, NETWORK_ERROR_MESSAGE } from './errors'

describe('getErrorMessage', () => {
  it('keeps the database message and falls back when there is none', () => {
    expect(getErrorMessage({ message: 'Ya hay un cliente con ese teléfono' }, 'x')).toBe('Ya hay un cliente con ese teléfono')
    expect(getErrorMessage(42, 'No se pudo guardar')).toBe('No se pudo guardar')
  })

  it('never shows the browser network error in English (ADR 0065)', () => {
    for (const raw of ['Failed to fetch', 'TypeError: Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
      expect(getErrorMessage(new TypeError(raw), 'x')).toBe(NETWORK_ERROR_MESSAGE)
    }
  })
})
