import { supabase } from '@/shared/lib/supabase'

/** ¿Está abierto el registro público? (ADR 0008 D8: se activa con SMTP y CAPTCHA configurados). */
export const PUBLIC_SIGNUP_ENABLED = import.meta.env.VITE_PUBLIC_SIGNUP === 'true'
export const TURNSTILE_SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined

/**
 * Datos del negocio que viajan con el registro y se usan al confirmar el
 * correo: la organización, su primera Cuenta y el plan (ADR 0010). Nada se
 * crea en la base hasta confirmar; ahí se crea todo junto.
 */
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
  /** Primera Cuenta: por defecto, el nombre del negocio. */
  accountName?: string
  accountIcon?: string
}

export const CONFIRMED_PATH = '/registro/confirmado'

export async function signUpBusiness(input: {
  fullName: string
  email: string
  password: string
  organization: PendingOrganization
  plan: string
  captchaToken?: string
}): Promise<{ hasSession: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: { full_name: input.fullName.trim(), pending_organization: input.organization, plan: input.plan },
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

/** Error de la base cuando el plan elegido ya no se puede elegir (retirado, manipulado…). */
export const PLAN_NOT_AVAILABLE = 'PLAN_NOT_AVAILABLE'

/**
 * Crea organización + suscripción + primera Cuenta (idempotente) y devuelve
 * el identificador de la Cuenta. La base valida el plan.
 */
export async function createOrganization(org: PendingOrganization, plan: string | null, fullName?: string): Promise<string> {
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
    p_plan: plan ?? undefined,
    p_account_name: org.accountName || undefined,
    p_account_icon: org.accountIcon || undefined,
  })
  if (error) throw error
  return data
}

export function pendingOrganizationOf(metadata: Record<string, unknown> | undefined): PendingOrganization | null {
  const value = metadata?.pending_organization
  return value && typeof value === 'object' && 'name' in value ? (value as PendingOrganization) : null
}

export function pendingPlanOf(metadata: Record<string, unknown> | undefined): string | null {
  const value = metadata?.plan
  return typeof value === 'string' && value ? value : null
}

/** Cambia el plan guardado con el registro (si el elegido dejó de estar disponible). */
export async function updatePendingPlan(plan: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { plan } })
  if (error) throw error
}
