import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
const { enabledOwnerMethods, oauthErrorFromUrl, ownerAuthErrorMessage, toE164 } = await import('./ownerAuth')

// ADR 0025: the owner's sign-up methods.
describe('owner sign-up methods', () => {
  it('only the configured methods show (email is always there, outside this list)', () => {
    expect(enabledOwnerMethods({ google: true, instagram: false, phone: true })).toEqual(['google', 'phone'])
    expect(enabledOwnerMethods({ google: false, instagram: false, phone: false })).toEqual([])
  })

  it.each([
    ['CO', '300 123 4567', '+573001234567'],
    ['CO', '(300) 123-4567', '+573001234567'],
    ['MX', '55 1234 5678', '+525512345678'],
    ['ES', '612 34 56 78', '+34612345678'],
    ['CO', '+52 55 1234 5678', '+525512345678'],
  ])('%s %s → %s', (country, input, expected) => {
    expect(toE164(country, input)).toBe(expected)
  })

  it.each([
    ['CO', '123'],
    ['CO', 'abc 123 4567'],
    ['CO', ''],
    ['CO', '+12'],
    ['XX', '3001234567'],
  ])('rejects %s "%s"', (country, input) => {
    expect(toE164(country, input)).toBeNull()
  })

  it('errors in plain Spanish, never the raw message', () => {
    expect(ownerAuthErrorMessage(new Error('Unsupported provider: provider is not enabled'))).toMatch(/todavía no está disponible/)
    expect(ownerAuthErrorMessage(new Error('Token has expired or is invalid'))).toMatch(/no es correcto o ya venció/)
    expect(ownerAuthErrorMessage(new Error('Signups not allowed for otp'))).toMatch(/No encontramos un negocio/)
    expect(ownerAuthErrorMessage(new Error('For security purposes, you can only request this after 42 seconds.'))).toMatch(/Demasiados intentos/)
    expect(ownerAuthErrorMessage(new Error('something weird'))).toBe('No pudimos completar el inicio de sesión. Inténtalo de nuevo.')
  })

  it('reads the error an OAuth provider sends back', () => {
    expect(oauthErrorFromUrl('https://quanela.com/registro?error=access_denied&error_description=User+cancelled')).toBe('Cancelaste el inicio de sesión.')
    expect(oauthErrorFromUrl('https://quanela.com/registro#error=server_error&error_description=Unsupported+provider')).toMatch(/todavía no está disponible/)
    expect(oauthErrorFromUrl('https://quanela.com/registro?continuar=1')).toBeNull()
  })
})
