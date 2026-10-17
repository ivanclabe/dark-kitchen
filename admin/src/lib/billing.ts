import { supabase } from './supabase'

/**
 * Subscriptions from the platform (ADR 0066). Every call is a dk_ga_* function:
 * Global Admin role + second factor. Payments themselves only come from Wompi or
 * from a transfer recorded here with its receipt.
 */
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never)
  if (error) throw error
  return data as T
}

export type BillingSettingKey = 'billing_enforced' | 'billing_payments_active' | 'billing_grace_days' | 'billing_renewal_notice_days'

export interface BillingOverview {
  settings: Partial<Record<BillingSettingKey, string>>
  counts: {
    incomplete: number
    active: number
    exempt: number
    trialing: number
    pastDue: number
    expired: number
    failedRenewals7d: number
    invalidEvents7d: number
    mismatches7d: number
  }
  attention: { organizationId: string; name: string; status: 'past_due' | 'expired'; since: string | null }[]
  recentEvents: { reference: string | null; status: string | null; valid: boolean; result: string | null; environment: string | null; receivedAt: string }[]
}

export type BillingMode = 'online' | 'manual' | 'exempt'

export interface OrgBillingInvoice {
  id: string
  number: string
  kind: 'activation' | 'renewal' | 'upgrade' | 'transfer' | null
  planKey: string | null
  billingPeriod: 'monthly' | 'annual' | null
  amount: number
  currency: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  method: string | null
  issuedAt: string
  dueAt: string | null
  paidAt: string | null
  attempts: number
  nextAttemptAt: string | null
  refundedAmount: number
  supportPath: string | null
  notes: string | null
  payments: { reference: string; status: string; method: string | null; automatic: boolean; transactionId: string | null; message: string | null; createdAt: string }[]
}

export interface OrgBilling {
  subscription: {
    status: string
    mode: BillingMode
    planKey: string
    billingPeriod: 'monthly' | 'annual'
    currentPeriodEnd: string | null
    graceEndsAt: string | null
    cancelAtPeriodEnd: boolean
    paymentMethod: string | null
    customerEmail: string | null
    isCurrent: boolean
  }
  invoices: OrgBillingInvoice[]
}

export const BILLING_OVERVIEW_KEY = ['ga', 'billing'] as const
export const fetchBillingOverview = () => rpc<BillingOverview>('dk_ga_billing_overview')
export const setBillingSetting = (key: BillingSettingKey, value: string) => rpc<void>('dk_ga_set_billing_setting', { p_key: key, p_value: value })
export const fetchOrgBilling = (organizationId: string) => rpc<OrgBilling>('dk_ga_billing_org', { p_organization_id: organizationId })
export const setBillingMode = (organizationId: string, mode: BillingMode) => rpc<void>('dk_ga_set_billing_mode', { p_organization_id: organizationId, p_mode: mode })
export const recordRefund = (invoiceId: string, amount: number, note: string) => rpc<void>('dk_ga_record_refund', { p_invoice_id: invoiceId, p_amount: amount, p_note: note })
export const retryCharge = (invoiceId: string) => rpc<void>('dk_ga_retry_charge', { p_invoice_id: invoiceId })

/** A transfer with its receipt: the file goes to the private bucket first (only the platform reads it). */
export async function recordTransfer(input: {
  organizationId: string
  amount: number
  paidOn: string
  planKey: string
  billingPeriod: 'monthly' | 'annual'
  note: string
  receipt: File | null
}): Promise<string> {
  let supportPath: string | null = null
  if (input.receipt) {
    const safe = input.receipt.name.replace(/[^\w.-]+/g, '_').slice(-80)
    supportPath = `${input.organizationId}/${Date.now()}-${safe}`
    const { error } = await supabase.storage.from('billing-supports').upload(supportPath, input.receipt, { contentType: input.receipt.type, upsert: false })
    if (error) throw error
  }
  return rpc<string>('dk_ga_record_transfer', {
    p_organization_id: input.organizationId,
    p_amount: input.amount,
    p_paid_on: input.paidOn,
    p_plan_key: input.planKey,
    p_billing_period: input.billingPeriod,
    p_support_path: supportPath,
    p_note: input.note,
  })
}

/** A short-lived link to see a receipt. */
export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('billing-supports').createSignedUrl(path, 120)
  if (error) throw error
  return data.signedUrl
}

export const SUBSCRIPTION_LABEL: Record<string, string> = {
  incomplete: 'Sin activar',
  trialing: 'Prueba',
  active: 'Activa',
  past_due: 'Pago pendiente',
  canceled: 'Cancelada',
  expired: 'Vencida',
}

export const MODE_LABEL: Record<BillingMode, string> = {
  online: 'En línea (Wompi)',
  manual: 'Transferencia',
  exempt: 'Exenta',
}
