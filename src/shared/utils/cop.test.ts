import { describe, expect, it } from 'vitest'
import { emailError, isValidEmail, normalizeEmail } from './email'
import { formatMoney, formatMoneyCompact } from './format'
import { groupWhileTyping, parseLocaleNumber } from './numberInput'
import { formatPhone, groupNational, phoneHref, splitE164, toE164 } from './phone'

describe('pesos colombianos (ADR 0039)', () => {
  it('whole pesos with «.» for thousands; negatives before the sign; COP where it must be explicit', () => {
    expect(formatMoney(1250000)).toBe('$1.250.000')
    expect(formatMoney(0)).toBe('$0')
    expect(formatMoney(-5000)).toBe('-$5.000')
    expect(formatMoney(25000, { code: true })).toBe('$25.000 COP')
    expect(formatMoney(-0.4)).toBe('$0')
  })

  it('a cost per unit keeps its cents («$3,25»); a whole amount stays whole', () => {
    expect(formatMoney(3.25, { decimals: 'auto' })).toBe('$3,25')
    expect(formatMoney(12.5, { decimals: 'auto' })).toBe('$12,50')
    expect(formatMoney(2500, { decimals: 'auto' })).toBe('$2.500')
    expect(formatMoney(3.25)).toBe('$3')
  })

  it('short amounts for charts', () => {
    expect(formatMoneyCompact(1_250_000)).toBe('$1,3 M')
    expect(formatMoneyCompact(850_000)).toBe('$850 mil')
    expect(formatMoneyCompact(900)).toBe('$900')
  })

  it('reads what is typed the Colombian way', () => {
    expect(parseLocaleNumber('1.250.000')).toBe(1250000)
    expect(parseLocaleNumber('$ 25.000 COP')).toBe(25000)
    expect(parseLocaleNumber('3,25')).toBe(3.25)
    expect(parseLocaleNumber('1.250,5')).toBe(1250.5)
    expect(parseLocaleNumber('3.5')).toBe(3.5)
    expect(parseLocaleNumber('')).toBeNull()
    expect(parseLocaleNumber('abc')).toBeNull()
    expect(parseLocaleNumber('3,256', { decimals: 2 })).toBe(3.26)
  })

  it('groups while typing, keeping a decimal part being typed', () => {
    expect(groupWhileTyping('1250000', 0)).toBe('1.250.000')
    expect(groupWhileTyping('1.250.0001', 0)).toBe('12.500.001')
    expect(groupWhileTyping('3,2', 2)).toBe('3,2')
    expect(groupWhileTyping('12,', 2)).toBe('12,')
    expect(groupWhileTyping('3,256', 2)).toBe('3,25')
    expect(groupWhileTyping('3,5', 0)).toBe('3')
    expect(groupWhileTyping('$abc', 0)).toBe('')
  })
})

describe('phones (ADR 0039)', () => {
  it('Colombia: a mobile or a landline to E.164; anything else is not valid', () => {
    expect(toE164('CO', '300 123 4567')).toBe('+573001234567')
    expect(toE164('CO', '(601) 234 5678')).toBe('+576012345678')
    expect(toE164('CO', '573001234567')).toBe('+573001234567')
    expect(toE164('CO', '+52 55 1234 5678')).toBe('+525512345678')
    expect(toE164('CO', '2345678')).toBeNull()
    expect(toE164('CO', '400 123 4567')).toBeNull()
    expect(toE164('MX', '55 1234 5678')).toBe('+525512345678')
  })

  it('splits a stored phone into its country and number; shows it grouped', () => {
    expect(splitE164('+573001234567')).toEqual({ country: 'CO', national: '3001234567' })
    expect(splitE164('+5939876543')).toEqual({ country: 'EC', national: '9876543' })
    expect(splitE164('wa-abc')).toEqual({ country: 'CO', national: 'wa-abc' })
    expect(groupNational('CO', '3001234567')).toBe('300 123 4567')
    expect(formatPhone('+573001234567')).toBe('+57 300 123 4567')
    expect(formatPhone('e9f1aa22')).toBe('e9f1aa22')
    expect(formatPhone(null)).toBe('')
    expect(phoneHref('+573001234567')).toBe('tel:+573001234567')
    expect(phoneHref('e9f1aa22')).toBeNull()
  })
})

describe('e-mails (ADR 0039)', () => {
  it('without spaces and in lowercase; says what is missing', () => {
    expect(normalizeEmail('  Ventas@Proveedor.CO ')).toBe('ventas@proveedor.co')
    expect(isValidEmail('juan@correo.com')).toBe(true)
    expect(isValidEmail('juan@')).toBe(false)
    expect(emailError('')).toBeNull()
    expect(emailError('', { required: true })).toBe('Escribe el correo.')
    expect(emailError('juan.correo.com')).toBe('Falta la @ del correo.')
    expect(emailError('juan@correo')).toMatch(/dominio/)
    expect(emailError('juan @correo.com')).toMatch(/espacios/)
  })
})

describe('typing a phone (ADR 0039)', () => {
  it('Colombia stops at 10 digits; a pasted number keeps or brings its country', async () => {
    const { readTyped } = await import('./phone')
    expect(readTyped('CO', '300 123 4567 89')).toEqual({ country: 'CO', digits: '3001234567' })
    expect(readTyped('CO', '573001234567')).toEqual({ country: 'CO', digits: '3001234567' })
    expect(readTyped('CO', '+52 55 1234 5678')).toEqual({ country: 'MX', digits: '5512345678' })
  })
})
