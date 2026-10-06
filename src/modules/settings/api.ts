import { supabase } from '@/shared/lib/supabase'

/**
 * Configuración of the active account (ADR 0024): operation, activity log,
 * billing and AI usage (the alerts are in the bell, ADR 0037). Everything is read for the ACTIVE account (the
 * x-dk-kitchen-id header) and the database checks every permission again.
 */

export interface RecentEvent {
  id: string
  createdAt: string
  eventType: string
  category: string
  summary: string
  result: 'success' | 'failure'
  actor: string | null
  account?: string | null
}

export interface AccountObservability {
  generatedAt: string
  account: { id: string; name: string; slug: string; iconKey: string | null; active: boolean; timezone: string }
  orders: {
    today: { created: number; delivered: number; cancelled: number; sales: number }
    week: { created: number; delivered: number; cancelled: number; sales: number }
    byChannel: Record<string, number>
    byDay: { date: string; orders: number; sales: number }[]
  }
  inProgress: number
  late: number
  avgPrepMinutes: number | null
  inventory: { movements: Record<string, number>; lowStock: number }
  purchases: { confirmed: number; confirmedAmount: number; drafts: number }
  payments: { count: number; amount: number }
  ai: { runs24h: number; errors24h: number; limitPerDay: number }
  features: { key: string; label: string; category: string; includedInPlan: boolean; enabled: boolean }[]
  team: { members: number; active7d: number; lastSignInAt: string | null }
  modules: { accountActive: boolean; hoursConfigured: boolean; slaConfigured: boolean }
  recentChanges: RecentEvent[]
}

export async function fetchAccountObservability(organizationId: string, accountId: string): Promise<AccountObservability> {
  const { data, error } = await supabase.rpc('dk_account_observability', { p_organization_id: organizationId, p_kitchen_id: accountId })
  if (error) throw error
  return data as unknown as AccountObservability
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------
export const EVENT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'accounts', label: 'Cuentas' },
  { value: 'team', label: 'Equipo' },
  { value: 'roles', label: 'Roles y permisos' },
  { value: 'features', label: 'Funciones' },
  { value: 'ai', label: 'IA' },
  { value: 'billing', label: 'Plan y facturación' },
  { value: 'settings', label: 'Configuración' },
  { value: 'catalog', label: 'Catálogo' },
  { value: 'operations', label: 'Operación' },
  { value: 'auth', label: 'Inicios de sesión' },
  { value: 'integrations', label: 'Integraciones' },
  { value: 'other', label: 'Otros' },
]

export function categoryLabel(value: string): string {
  return EVENT_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

export interface AuditEvent {
  id: string
  createdAt: string
  eventType: string
  category: string
  summary: string
  result: 'success' | 'failure'
  source: 'db' | 'edge' | 'app'
  action: string
  table: string
  recordKey: string
  context: Record<string, unknown>
  actor: { id: string; name: string; avatarKey: string | null } | null
  account: { id: string; name: string; iconKey: string | null } | null
  changes: Record<string, { from: unknown; to: unknown }> | null
}

export interface EventFilters {
  category?: string
  actorId?: string
  from?: string
  to?: string
  search?: string
}

export interface EventPage {
  events: AuditEvent[]
  hasMore: boolean
}

export async function fetchAccountEvents(filters: EventFilters, cursor?: { at: string; id: string }, limit = 30): Promise<EventPage> {
  const { data, error } = await supabase.rpc('dk_account_events', {
    ...(filters.category ? { p_category: filters.category } : {}),
    ...(filters.actorId ? { p_actor: filters.actorId } : {}),
    ...(filters.from ? { p_from: filters.from } : {}),
    ...(filters.to ? { p_to: filters.to } : {}),
    ...(filters.search?.trim() ? { p_search: filters.search.trim() } : {}),
    ...(cursor ? { p_before_at: cursor.at, p_before_id: cursor.id } : {}),
    p_limit: limit,
  })
  if (error) throw error
  return data as unknown as EventPage
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
export interface Invoice {
  id: string
  number: string
  periodStart: string | null
  periodEnd: string | null
  amount: number
  currency: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  issuedAt: string
  paidAt: string | null
  pdfUrl: string | null
}

export async function fetchInvoices(organizationId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('dk_invoices')
    .select('id, number, period_start, period_end, amount, currency, status, issued_at, paid_at, pdf_url')
    .eq('organization_id', organizationId)
    .order('issued_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data.map((i) => ({
    id: i.id,
    number: i.number,
    periodStart: i.period_start,
    periodEnd: i.period_end,
    amount: Number(i.amount),
    currency: i.currency,
    status: i.status as Invoice['status'],
    issuedAt: i.issued_at,
    paidAt: i.paid_at,
    pdfUrl: i.pdf_url,
  }))
}

// ---------------------------------------------------------------------------
// AI usage of the active account (ADR 0014; no costs: those are the platform's)
// ---------------------------------------------------------------------------
export interface AccountAiUsage {
  days: number
  dailyLimit: number
  totals: { runs: number; errors: number; runs24h: number }
  byFeature: { key: string; label: string | null; runs: number; errors: number }[]
  /** ADR 0033: how Copilot is doing (aggregated; the questions are each person's own). */
  copilot?: {
    dailyLimit: number
    questions: number
    byVoice: number
    errors: number
    cancelled: number
    p50Ms: number | null
    p90Ms: number | null
    thumbsUp: number
    thumbsDown: number
    byScope: Partial<Record<string, number>>
  }
}

export async function fetchAccountAiUsage(days = 30): Promise<AccountAiUsage> {
  const { data, error } = await supabase.rpc('dk_account_ai_usage', { p_days: days })
  if (error) throw error
  return data as unknown as AccountAiUsage
}
