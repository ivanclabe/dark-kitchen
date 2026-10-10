import { describe, expect, it } from 'vitest'
import { INVALID_CREDENTIALS_MESSAGE, signInErrorMessage } from './authErrors'

// The login never shows Supabase's English text.
describe('sign-in errors in plain Spanish', () => {
  it('wrong email or password, by code or by the old text', () => {
    expect(signInErrorMessage({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' })).toBe(INVALID_CREDENTIALS_MESSAGE)
    expect(signInErrorMessage({ message: 'Invalid login credentials' })).toBe(INVALID_CREDENTIALS_MESSAGE)
  })

  it('unconfirmed email, too many attempts, no connection', () => {
    expect(signInErrorMessage({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toMatch(/confirmas tu correo/)
    expect(signInErrorMessage({ status: 429, message: 'Request rate limit reached' })).toMatch(/Demasiados intentos/)
    expect(signInErrorMessage({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toMatch(/No pudimos conectarnos/)
  })

  it('anything else: a Spanish message, never the raw one', () => {
    const message = signInErrorMessage({ message: 'Database error querying schema' })
    expect(message).toBe('No pudimos iniciar sesión. Intenta de nuevo en un momento.')
    expect(signInErrorMessage(null)).toBe(message)
  })
})
