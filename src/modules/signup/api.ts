import { supabase } from '@/shared/lib/supabase'

/** ¿Está abierto el registro público? (ADR 0008 D8: se activa con SMTP y CAPTCHA configurados). */
export const PUBLIC_SIGNUP_ENABLED = import.meta.env.VITE_PUBLIC_SIGNUP === 'true'
export const TURNSTILE_SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined

/** Datos del negocio que viajan con el registro y se usan al confirmar el correo. */
export interface PendingOrganization {
  name: string
  sector: string
  category: string
  address?: string
  city?: string
  country: string
  phone?: string
  taxId?: string
  legalName?: string
}

export const CONFIRMED_PATH = '/registro/confirmado'

export async function signUpBusiness(input: {
  fullName: string
  email: string
  password: string
  organization: PendingOrganization
  captchaToken?: string
}): Promise<{ hasSession: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: { full_name: input.fullName.trim(), pending_organization: input.organization },
      emailRedirectTo: `${window.location.origin}${CONFIRMED_PATH}`,
      captchaToken: input.captchaToken,
    },
  })
  if (error) throw error
  // Sin sesión = hay que confirmar el correo (lo normal); con sesión = la confirmación está desactivada.
  return { hasSession: Boolean(data.session) }
}

export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}${CONFIRMED_PATH}` } })
  if (error) throw error
}

/** Crea organización + primera Cuenta (idempotente) y devuelve el identificador de la Cuenta. */
export async function createOrganization(org: PendingOrganization, fullName?: string): Promise<string> {
  const { data, error } = await supabase.rpc('dk_create_organization', {
    p_name: org.name,
    p_sector: org.sector,
    p_category: org.category,
    p_address: org.address ?? undefined,
    p_city: org.city ?? undefined,
    p_country: org.country,
    p_phone: org.phone ?? undefined,
    p_tax_id: org.taxId ?? undefined,
    p_legal_name: org.legalName ?? undefined,
    p_full_name: fullName ?? undefined,
  })
  if (error) throw error
  return data
}

export function pendingOrganizationOf(metadata: Record<string, unknown> | undefined): PendingOrganization | null {
  const value = metadata?.pending_organization
  return value && typeof value === 'object' && 'name' in value ? (value as PendingOrganization) : null
}
