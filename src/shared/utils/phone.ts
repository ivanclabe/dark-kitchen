/**
 * Phones (ADR 0039): chosen by country, shown with spaces, stored in E.164
 * (+573001234567). The database normalizes them the same way
 * (dk_normalize_phone), whoever writes them.
 */
export interface PhoneCountry {
  code: string
  label: string
  dial: string
  flag: string
}

/** The countries of the sign-up (business.ts), Colombia first. */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: 'CO', label: 'Colombia', dial: '57', flag: '🇨🇴' },
  { code: 'MX', label: 'México', dial: '52', flag: '🇲🇽' },
  { code: 'PE', label: 'Perú', dial: '51', flag: '🇵🇪' },
  { code: 'EC', label: 'Ecuador', dial: '593', flag: '🇪🇨' },
  { code: 'CL', label: 'Chile', dial: '56', flag: '🇨🇱' },
  { code: 'AR', label: 'Argentina', dial: '54', flag: '🇦🇷' },
  { code: 'PA', label: 'Panamá', dial: '507', flag: '🇵🇦' },
  { code: 'VE', label: 'Venezuela', dial: '58', flag: '🇻🇪' },
  { code: 'US', label: 'Estados Unidos', dial: '1', flag: '🇺🇸' },
  { code: 'ES', label: 'España', dial: '34', flag: '🇪🇸' },
]

export const DIAL_CODES: Record<string, string> = Object.fromEntries(PHONE_COUNTRIES.map((c) => [c.code, c.dial]))

const countryOf = (code: string) => PHONE_COUNTRIES.find((c) => c.code === code)

/** Colombia: a mobile (3…) or a landline (60…), 10 digits. */
const CO_NATIONAL = /^(3\d{9}|60\d{8})$/

/** Whether the national number (digits only) is valid for the country. */
export function isValidNational(country: string, digits: string): boolean {
  if (country === 'CO') return CO_NATIONAL.test(digits)
  return digits.length >= 7 && digits.length <= 12
}

/**
 * The number in E.164 (+573001234567), or null when it is not a valid one.
 * Accepts spaces, dashes, dots and parentheses; a number that starts with "+"
 * already carries its country.
 */
export function toE164(country: string, input: string): string | null {
  const trimmed = input.trim()
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null
  const digits = trimmed.replace(/\D/g, '')
  if (trimmed.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  const dial = DIAL_CODES[country]
  if (!dial) return null
  let national = digits.replace(/^0+/, '')
  // Typed with the country code but without «+» (573001234567).
  if (national.length > 10 && national.startsWith(dial) && isValidNational(country, national.slice(dial.length))) national = national.slice(dial.length)
  if (country === 'CO' ? !CO_NATIONAL.test(national) : national.length < 7 || national.length > 12) return null
  const full = `${dial}${national}`
  return full.length <= 15 ? `+${full}` : null
}

/** «+573001234567» → Colombia and «3001234567». Unknown or not a phone: Colombia and the text as it is. */
export function splitE164(value: string | null | undefined): { country: string; national: string } {
  const v = (value ?? '').trim()
  if (v.startsWith('+')) {
    const digits = v.slice(1).replace(/\D/g, '')
    // Longest dial code first (593 before 59…).
    const match = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => digits.startsWith(c.dial))
    if (match) return { country: match.code, national: digits.slice(match.dial.length) }
  }
  return { country: 'CO', national: v }
}

/** «3001234567» → «300 123 4567»; «6012345678» → «601 234 5678»; others in groups as typed. */
export function groupNational(country: string, digits: string): string {
  const d = digits.replace(/\D/g, '')
  if (country === 'CO' || country === 'US') return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ') + (d.length > 10 ? ` ${d.slice(10)}` : '')
  return d.replace(/(\d{2,4})(?=(\d{3,4})+$)/g, '$1 ').trim()
}

/**
 * How a stored phone is shown: «+57 300 123 4567». A WhatsApp identifier that
 * is not a number (letters) is never shown as if it were a phone: «Vía WhatsApp».
 */
export function formatPhone(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  if (/[a-z]/i.test(v)) return 'Vía WhatsApp'
  if (!v.startsWith('+')) return v
  const { country, national } = splitE164(v)
  const c = countryOf(country)
  return c && v.slice(1).replace(/\D/g, '').startsWith(c.dial) ? `+${c.dial} ${groupNational(country, national)}` : v
}

/** A link to call it (tel:+573001234567), or null. */
export function phoneHref(value: string | null | undefined): string | null {
  const v = (value ?? '').trim()
  return /^\+\d{8,15}$/.test(v) ? `tel:${v}` : null
}

/**
 * The message under a phone field, or null when it is fine: empty and
 * optional, a valid phone (E.164), or the value it already had.
 */
export function phoneError(value: string, { required = false, original }: { required?: boolean; original?: string | null } = {}): string | null {
  if (!value) return required ? 'Escribe el teléfono.' : null
  if (/^\+\d{8,15}$/.test(value) || value === (original ?? undefined)) return null
  return 'Revisa el número: en Colombia, un celular empieza por 3 y tiene 10 dígitos (un fijo, por 60).'
}

/** Longest national number per country (Colombia: 10 digits). */
const MAX_NATIONAL: Record<string, number> = { CO: 10, US: 10 }

/**
 * What was typed or pasted: «+57 300…» or «57300…» carry the country; the
 * national number never grows past its length.
 */
export function readTyped(country: string, raw: string): { country: string; digits: string } {
  let nextCountry = country
  let digits = raw.replace(/\D/g, '')
  if (raw.trim().startsWith('+')) {
    const split = splitE164(`+${digits}`)
    nextCountry = split.country
    digits = split.national
  } else {
    const dial = PHONE_COUNTRIES.find((c) => c.code === country)?.dial ?? ''
    const max = MAX_NATIONAL[country] ?? 12
    if (dial && digits.length > max && digits.startsWith(dial)) digits = digits.slice(dial.length)
  }
  return { country: nextCountry, digits: digits.slice(0, MAX_NATIONAL[nextCountry] ?? 12) }
}
