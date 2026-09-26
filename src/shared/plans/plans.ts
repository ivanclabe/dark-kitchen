import { supabase } from '@/shared/lib/supabase'
import type { FeatureCategory, FeatureKey } from '@/shared/features/features'

/**
 * Planes (ADR 0010). La fuente es la base (dk_plans + dk_plan_features):
 * precios, límites, viñetas, CTA y orden se cambian allí, sin tocar la app.
 * Se leen sin sesión (la landing muestra precios a cualquiera).
 */
export type PlanKey = string
export type BillingPeriod = 'monthly' | 'annual'

export interface Plan {
  key: PlanKey
  name: string
  description: string
  badge: string | null
  priceMonthly: number
  priceYearly: number | null
  currency: string
  trialDays: number
  /** null = ilimitado. */
  limits: { accounts: number | null; users: number | null }
  highlights: string[]
  cta: 'signup' | 'contact_sales'
  ctaLabel: string
  contactUrl: string | null
  selfServe: boolean
  sortOrder: number
  features: FeatureKey[]
}

export interface CatalogFeature {
  key: FeatureKey
  category: FeatureCategory
  label: string
  sortOrder: number
}

export interface PublicPricing {
  plans: Plan[]
  features: CatalogFeature[]
}

export const PUBLIC_PLANS_KEY = ['public-plans'] as const

export async function fetchPublicPricing(): Promise<PublicPricing> {
  const [plans, features] = await Promise.all([
    supabase
      .from('dk_plans')
      .select(
        'key, name, description, badge, price_monthly, price_yearly, currency, trial_days, limits, highlights, cta, cta_label, contact_url, self_serve, sort_order, dk_plan_features ( feature_key )',
      )
      .order('sort_order'),
    supabase.from('dk_features').select('key, category, label, sort_order').eq('active', true).order('sort_order'),
  ])
  if (plans.error) throw plans.error
  if (features.error) throw features.error
  return {
    plans: plans.data.map((p) => {
      const limits = (p.limits ?? {}) as { accounts?: number | null; users?: number | null }
      return {
        key: p.key,
        name: p.name,
        description: p.description,
        badge: p.badge,
        priceMonthly: Number(p.price_monthly),
        priceYearly: p.price_yearly === null ? null : Number(p.price_yearly),
        currency: p.currency,
        trialDays: p.trial_days,
        limits: { accounts: limits.accounts ?? null, users: limits.users ?? null },
        highlights: p.highlights,
        cta: p.cta as Plan['cta'],
        ctaLabel: p.cta_label,
        contactUrl: p.contact_url,
        selfServe: p.self_serve,
        sortOrder: p.sort_order,
        features: p.dk_plan_features.map((f) => f.feature_key as FeatureKey),
      }
    }),
    features: features.data.map((f) => ({ key: f.key as FeatureKey, category: f.category as FeatureCategory, label: f.label, sortOrder: f.sort_order })),
  }
}

/** "$99.900" (sin decimales, separador de miles es-CO). */
export function formatAmount(amount: number): string {
  return `$${amount.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}

/** "$99.900 COP/mes" o "$999.000 COP/año". */
export function formatPlanPrice(plan: Pick<Plan, 'priceMonthly' | 'priceYearly' | 'currency'>, period: BillingPeriod = 'monthly'): string {
  const amount = period === 'annual' && plan.priceYearly !== null ? plan.priceYearly : plan.priceMonthly
  return `${formatAmount(amount)} ${plan.currency}/${period === 'annual' && plan.priceYearly !== null ? 'año' : 'mes'}`
}

/** "1 cuenta", "3 cuentas", "Cuentas ilimitadas". */
export function limitLabel(value: number | null, singular: string, plural: string): string {
  if (value === null) return `${plural.charAt(0).toUpperCase()}${plural.slice(1)} ilimitad${plural.endsWith('as') ? 'as' : 'os'}`
  return `${value} ${value === 1 ? singular : plural}`
}

/** ¿Algún plan tiene facturación anual? (el selector mensual/anual solo aparece entonces). */
export function hasAnnualBilling(plans: Plan[]): boolean {
  return plans.some((p) => p.priceYearly !== null)
}

/** Plan que se puede elegir en el registro (los de ventas, no). */
export function isSelectablePlan(plans: Plan[] | undefined, key: string | null | undefined): key is PlanKey {
  return Boolean(key && plans?.some((p) => p.key === key && p.selfServe))
}

/** Ruta del registro con el plan elegido. */
export function signupPath(plan?: PlanKey | null): string {
  return plan ? `/registro?plan=${encodeURIComponent(plan)}` : '/registro'
}
