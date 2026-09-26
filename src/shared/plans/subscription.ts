import { supabase } from '@/shared/lib/supabase'
import type { FeatureKey } from '@/shared/features/features'

/** Suscripción de una organización (ADR 0010). El plan es de la organización, no del usuario. */
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: 'Prueba gratis',
  active: 'Activa',
  past_due: 'Pago pendiente',
  canceled: 'Cancelada',
  expired: 'Vencida',
}

export interface Subscription {
  plan: {
    key: string
    name: string
    description: string
    priceMonthly: number
    priceYearly: number | null
    currency: string
    highlights: string[]
    /** Contacto de ventas para cambiar de plan. */
    contactUrl: string | null
  }
  status: SubscriptionStatus
  isCurrent: boolean
  billingPeriod: 'monthly' | 'annual'
  startedAt: string
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  /** null = ilimitado. */
  limits: { accounts: number | null; users: number | null }
  usage: { accounts: number; users: number }
  features: FeatureKey[]
}

export async function fetchSubscription(organizationId: string): Promise<Subscription | null> {
  const { data, error } = await supabase.rpc('dk_my_subscription', { p_organization_id: organizationId })
  if (error) throw error
  return (data as unknown as Subscription | null) ?? null
}

/** Solo la plataforma: cambiar plan, estado o periodicidad (upgrade, downgrade, cancelación). */
export async function setSubscription(organizationId: string, plan: string, status?: SubscriptionStatus): Promise<void> {
  const { error } = await supabase.rpc('dk_set_subscription', { p_organization_id: organizationId, p_plan_key: plan, ...(status ? { p_status: status } : {}) })
  if (error) throw error
}

/** Días que le quedan a la prueba (0 si terminó); null si no está en prueba. */
export function trialDaysLeft(sub: Pick<Subscription, 'status' | 'trialEndsAt'>, now: number): number | null {
  if (sub.status !== 'trialing' || !sub.trialEndsAt) return null
  return Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - now) / 86_400_000))
}

/** ¿Llegó al límite? (null = ilimitado). */
export function atLimit(used: number, limit: number | null): boolean {
  return limit !== null && used >= limit
}
