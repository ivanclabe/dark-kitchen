import { describe, expect, it } from 'vitest'
import { getErrorMessage, NETWORK_ERROR_MESSAGE, OUTDATED_DATABASE_MESSAGE } from './errors'

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

  it('a function the database does not have yet (frontend ahead of its migration) is explained in Spanish', () => {
    const missing = { code: 'PGRST202', message: 'Could not find the function public.dk_dashboard_series(p_from, p_granularity, p_to) in the schema cache' }
    expect(getErrorMessage(missing, 'x')).toBe(OUTDATED_DATABASE_MESSAGE)
    expect(getErrorMessage({ message: "Could not find the table 'public.dk_x' in the schema cache" }, 'x')).toBe(OUTDATED_DATABASE_MESSAGE)
  })
})
