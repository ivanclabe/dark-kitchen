import { describe, expect, it } from 'vitest'
import { billingMessage, billingNotice, formatCardNumber, isValidCardNumber, isValidExpiry, returnUrl } from './billing'

describe('billing helpers (ADR 0066)', () => {
  it('splits the database code from the message', () => {
    expect(billingMessage(new Error('PLAN_NOT_AVAILABLE: ese plan se contrata con ventas'), 'x')).toEqual({ code: 'PLAN_NOT_AVAILABLE', message: 'ese plan se contrata con ventas' })
    expect(billingMessage({ message: 'No autorizado' }, 'x')).toEqual({ message: 'No autorizado' })
    expect(billingMessage(null, 'Falló')).toEqual({ message: 'Falló' })
  })

  it('card number: groups of four and the Luhn check', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242')
    expect(isValidCardNumber('4242 4242 4242 4242')).toBe(true)
    expect(isValidCardNumber('4242 4242 4242 4241')).toBe(false)
    expect(isValidCardNumber('4242')).toBe(false)
  })

  it('expiry not in the past', () => {
    const now = new Date(2026, 9, 16)
    expect(isValidExpiry('10', '26', now)).toBe(true)
    expect(isValidExpiry('09', '26', now)).toBe(false)
    expect(isValidExpiry('13', '27', now)).toBe(false)
    expect(isValidExpiry('01', '2030', now)).toBe(true)
  })

  it('returns to the same screen, marked and without an old transaction', () => {
    expect(returnUrl({ origin: 'https://9vj58y.quanela.com', pathname: '/k/sabor/', search: '?id=old&env=test&tab=x' })).toBe('https://9vj58y.quanela.com/k/sabor/?tab=x&pago=1')
  })

  it('the banner: only for who pays, only what needs doing', () => {
    const base = {
      organizationId: 'o1', enforced: false, paymentsActive: true, current: true, blocked: false, status: 'active' as const, mode: 'online' as const,
      planKey: 'standard', billingPeriod: 'monthly' as const, currentPeriodEnd: '2026-11-16T13:00:00Z', graceEndsAt: null, cancelAtPeriodEnd: false,
      canPay: true, openRenewalDue: null, renewalNeedsPayment: false,
    }
    expect(billingNotice(base)).toBeNull()
    expect(billingNotice({ ...base, status: 'past_due', graceEndsAt: '2026-11-19T13:00:00Z' })?.tone).toBe('danger')
    expect(billingNotice({ ...base, openRenewalDue: '2026-11-16T13:00:00Z', renewalNeedsPayment: true })?.text).toContain('se renueva')
    expect(billingNotice({ ...base, openRenewalDue: '2026-11-16T13:00:00Z', renewalNeedsPayment: false })).toBeNull()
    expect(billingNotice({ ...base, status: 'past_due', canPay: false })).toBeNull()
    expect(billingNotice({ ...base, status: 'past_due', mode: 'exempt' })).toBeNull()
  })
})
