import { supabase } from '@/shared/lib/supabase'
import type { BillingPeriod } from '@/shared/plans/plans'
import { formatDate } from '@/shared/utils/format'

/**
 * Subscriptions paid with Wompi (ADR 0066). The database decides who pays, what and
 * how much; dk-billing talks to Wompi with the keys. Here: what the screens need.
 */

export interface BillingAccess {
  organizationId: string
  /** The platform blocks organizations without a current subscription. */
  enforced: boolean
  /** Online payments are open (keys configured and switched on by the platform). */
  paymentsActive: boolean
  current: boolean
  blocked: boolean
  status: 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'
  mode: 'online' | 'manual' | 'exempt'
  planKey: string
  billingPeriod: BillingPeriod
  currentPeriodEnd: string | null
  graceEndsAt: string | null
  cancelAtPeriodEnd: boolean
  /** This person can pay (billing.manage). */
  canPay: boolean
  /** The renewal waiting to be paid: its due date. */
  openRenewalDue: string | null
  /** That renewal is paid by hand (no saved card to charge). */
  renewalNeedsPayment: boolean
}

export const BILLING_ACCESS_KEY = ['billing-access'] as const

export async function fetchBillingAccess(): Promise<BillingAccess[]> {
  const { data, error } = await supabase.rpc('dk_my_billing_access')
  if (error) throw error
  return (data as unknown as BillingAccess[]) ?? []
}

export class BillingError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

/** The database errors come as "CODE: message"; the screen shows the message. */
export function billingMessage(err: unknown, fallback: string): { code?: string; message: string } {
  const raw = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : ''
  const match = /^([A-Z_]{4,}): (.*)$/s.exec(raw)
  if (match) return { code: match[1], message: match[2] }
  if (err instanceof BillingError) return { code: err.code, message: err.message || fallback }
  return { message: raw || fallback }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('dk-billing', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    const payload = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null
    const parsed = billingMessage({ message: payload?.error ?? '' }, 'No pudimos hablar con la pasarela de pagos. Inténtalo de nuevo.')
    throw new BillingError(parsed.message, parsed.code ?? payload?.code)
  }
  return data as T
}

export interface CheckoutResult {
  applied: boolean
  url?: string
  reference?: string
  amountInCents?: number
  currency?: string
  kind?: 'activation' | 'renewal' | 'upgrade'
  planName?: string
  billingPeriod?: BillingPeriod
}

/** Wompi's checkout (card, PSE, Nequi, Bancolombia). It comes back to `redirectUrl` with ?id=<transaction>. */
export function startCheckout(input: { organizationId: string; planKey?: string; billingPeriod?: BillingPeriod; redirectUrl: string }): Promise<CheckoutResult> {
  return invoke<CheckoutResult>({ action: 'checkout', ...input })
}

export interface WompiPublicConfig {
  env: 'sandbox' | 'production'
  apiUrl: string
  publicKey: string
  acceptance: { privacy: { token: string; permalink: string }; personalData: { token: string; permalink: string } }
}

export function fetchWompiConfig(organizationId: string): Promise<WompiPublicConfig> {
  return invoke<WompiPublicConfig>({ action: 'config', organizationId })
}

export interface CardInput {
  number: string
  expMonth: string
  expYear: string
  cvc: string
  holder: string
}

/**
 * The card goes from the browser straight to Wompi with the public key: Quanela only
 * receives the token (the number never reaches our servers).
 */
export async function tokenizeCard(config: Pick<WompiPublicConfig, 'apiUrl' | 'publicKey'>, card: CardInput): Promise<string> {
  const res = await fetch(`${config.apiUrl}/tokens/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.publicKey}` },
    body: JSON.stringify({
      number: card.number.replace(/\D/g, ''),
      cvc: card.cvc.trim(),
      exp_month: card.expMonth.padStart(2, '0'),
      exp_year: card.expYear.slice(-2),
      card_holder: card.holder.trim(),
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.status !== 'CREATED' || !body?.data?.id) {
    throw new BillingError('Wompi no aceptó la tarjeta. Revisa el número, la fecha y el código.')
  }
  return body.data.id as string
}

export interface CardPaymentResult {
  saved: boolean
  charged: boolean
  applied?: boolean
  status?: 'APPROVED' | 'DECLINED' | 'PENDING' | 'VOIDED' | 'ERROR'
  message?: string | null
}

export function payWithCard(input: {
  organizationId: string
  planKey?: string
  billingPeriod?: BillingPeriod
  cardToken: string
  acceptanceToken: string
  personalAuthToken: string
  email?: string
}): Promise<CardPaymentResult> {
  return invoke<CardPaymentResult>({ action: 'pay_with_card', ...input })
}

export function paymentStatus(transactionId: string): Promise<{ status: string; result: string }> {
  return invoke({ action: 'status', transactionId })
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(name as never, args as never)
  if (error) {
    const parsed = billingMessage(error, 'No se pudo guardar el cambio')
    throw new BillingError(parsed.message, parsed.code)
  }
}

export const cancelSubscription = (organizationId: string) => rpc('dk_billing_cancel', { p_organization_id: organizationId })
export const resumeSubscription = (organizationId: string) => rpc('dk_billing_resume', { p_organization_id: organizationId })
export const removeSavedCard = (organizationId: string) => rpc('dk_billing_remove_source', { p_organization_id: organizationId })
export const scheduleChange = (organizationId: string, planKey: string, billingPeriod: BillingPeriod) =>
  rpc('dk_billing_schedule_change', { p_organization_id: organizationId, p_plan_key: planKey, p_billing_period: billingPeriod })

/** Card number in groups of four as it is typed. */
export function formatCardNumber(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** Luhn: catches a mistyped number before asking Wompi. */
export function isValidCardNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

/** "MM/AA" not in the past. */
export function isValidExpiry(month: string, year: string, now = new Date()): boolean {
  const m = Number(month)
  const y = 2000 + Number(year.slice(-2))
  if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y)) return false
  return y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth() + 1)
}

/** Where Wompi comes back to: this same screen, without a previous transaction id. */
export function returnUrl(location: Pick<Location, 'origin' | 'pathname' | 'search'>): string {
  const params = new URLSearchParams(location.search)
  params.delete('id')
  params.delete('env')
  params.set('pago', '1')
  return `${location.origin}${location.pathname}?${params.toString()}`
}

/** What the person who pays has to know now, in one line above the screen (ADR 0066 §5). */
export function billingNotice(a: BillingAccess): { tone: 'warning' | 'danger'; text: string } | null {
  if (!a.canPay || a.mode === 'exempt' || !a.paymentsActive) return null
  if (a.status === 'past_due') {
    return { tone: 'danger', text: `No pudimos cobrar tu suscripción. Págala antes del ${formatDate(a.graceEndsAt ?? a.currentPeriodEnd ?? new Date().toISOString())} para no perder el acceso.` }
  }
  if (a.status === 'incomplete' && !a.blocked) return { tone: 'warning', text: 'Tu suscripción todavía no está activa. Actívala para seguir usando Quanela sin interrupciones.' }
  if (a.status === 'active' && a.cancelAtPeriodEnd && a.currentPeriodEnd) return { tone: 'warning', text: `Cancelaste tu suscripción: termina el ${formatDate(a.currentPeriodEnd)}.` }
  if (a.status === 'active' && a.renewalNeedsPayment && a.openRenewalDue) {
    return { tone: 'warning', text: `Tu suscripción se renueva el ${formatDate(a.openRenewalDue)}. Págala antes para no perder el acceso.` }
  }
  return null
}
