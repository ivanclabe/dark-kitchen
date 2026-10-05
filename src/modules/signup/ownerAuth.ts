import { supabase } from '@/shared/lib/supabase'

/**
 * Sign-up and sign-in methods of the person who CREATES a business (ADR 0025):
 * Google, Instagram (Supabase custom OAuth2 provider `custom:instagram`) and
 * phone (SMS code), besides email + password. Invited users keep their own
 * flow (invitation → activation → email + password). Each method shows only
 * when it is configured: Supabase holds the providers and their secrets; these
 * flags only switch the buttons on.
 */
export type OwnerMethod = 'google' | 'instagram' | 'phone'

export const OWNER_METHODS: Record<OwnerMethod, boolean> = {
  google: import.meta.env.VITE_AUTH_GOOGLE === 'true',
  instagram: import.meta.env.VITE_AUTH_INSTAGRAM === 'true',
  phone: import.meta.env.VITE_AUTH_PHONE === 'true',
}

export function enabledOwnerMethods(flags: Record<OwnerMethod, boolean> = OWNER_METHODS): OwnerMethod[] {
  return (['google', 'instagram', 'phone'] as const).filter((m) => flags[m])
}

/** The Supabase provider of each OAuth method. */
export const OAUTH_PROVIDER = { google: 'google', instagram: 'custom:instagram' } as const

/** Where the provider sends the person back: this same origin (the session is detected in the URL). */
export const OWNER_SIGNUP_RETURN = '/registro?continuar=1'

export async function continueWithProvider(method: 'google' | 'instagram', returnPath = OWNER_SIGNUP_RETURN): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: OAUTH_PROVIDER[method],
    options: { redirectTo: `${window.location.origin}${returnPath}` },
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------
/** Dial codes of the countries of the sign-up (business.ts COUNTRIES). */
export const DIAL_CODES: Record<string, string> = {
  CO: '57',
  MX: '52',
  PE: '51',
  EC: '593',
  CL: '56',
  AR: '54',
  PA: '507',
  VE: '58',
  US: '1',
  ES: '34',
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
  const national = digits.replace(/^0+/, '')
  if (national.length < 7 || national.length > 12) return null
  const full = `${dial}${national}`
  return full.length <= 15 ? `+${full}` : null
}

/**
 * Sends the SMS code. `create`: true while signing up (the user may not exist
 * yet); false on the login, which never creates users.
 */
export async function requestPhoneCode(phone: string, { create, captchaToken }: { create: boolean; captchaToken?: string }): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: create, channel: 'sms', captchaToken } })
  if (error) throw error
}

export async function verifyPhoneCode(phone: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: 'sms' })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Errors in plain Spanish (never the raw provider message)
// ---------------------------------------------------------------------------
export function ownerAuthErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const message = raw.toLowerCase()
  if (/provider is not enabled|unsupported provider|provider.*disabled|validation_failed.*provider/.test(message)) return 'Este método todavía no está disponible. Usa otro.'
  if (/phone.*(provider|sms).*not|sms provider|unable to get sms provider|phone signups are disabled/.test(message)) return 'El envío de códigos por SMS no está disponible ahora. Usa otro método.'
  if (/signups not allowed|user not found|otp_disabled/.test(message)) return 'No encontramos un negocio creado con ese número. Revisa el número o crea tu cuenta.'
  if (/token has expired|invalid.*(token|otp)|otp_expired|expired/.test(message)) return 'El código no es correcto o ya venció. Pide uno nuevo.'
  if (/rate limit|too many|security purposes|over_sms_send_rate_limit/.test(message)) return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'
  if (/captcha/.test(message)) return 'Completa la verificación de seguridad y vuelve a intentarlo.'
  if (/invalid phone|phone.*invalid|invalid.*number/.test(message)) return 'Ese número no es válido. Revísalo.'
  if (/access_denied|cancel/.test(message)) return 'Cancelaste el inicio de sesión.'
  return 'No pudimos completar el inicio de sesión. Inténtalo de nuevo.'
}

/** An OAuth provider sends errors back in the address (?error=…&error_description=…). */
export function oauthErrorFromUrl(href: string): string | null {
  const url = new URL(href)
  const params = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '')
  const error = url.searchParams.get('error') ?? params.get('error')
  if (!error) return null
  const description = url.searchParams.get('error_description') ?? params.get('error_description') ?? error
  return ownerAuthErrorMessage(`${error} ${description}`)
}
