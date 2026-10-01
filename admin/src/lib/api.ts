import { supabase } from './supabase'

/**
 * Global Admin data (ADR 0019). Every call goes to a dk_ga_* database
 * function that requires the Global Admin role and a second factor; the
 * portal never reads tables directly.
 */
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never)
  if (error) throw error
  return data as T
}

export interface DailyPoint {
  day: string
  organizations?: number
  users?: number
  aiRuns?: number
  runs?: number
  errors?: number
}

export interface ActivityItem {
  id?: string
  at: string
  type: string
  category: string | null
  summary: string | null
  result: 'success' | 'failure' | null
  source?: string
  organization?: { id: string; name: string } | string | null
  account?: string | null
  actor?: { id: string; name: string; email: string | null } | string | null
}

export interface Overview {
  range: { from: string; to: string }
  organizations: { total: number; active: number; inactive: number; new: number }
  users: { total: number; active30d: number; pending: number; new: number }
  ai: { organizationsWithAi: number; organizationsUsingAi: number; featuresActive: number; featuresTotal: number; runs: number; errors: number }
  daily: DailyPoint[]
  recentActivity: ActivityItem[]
  alerts: { aiErrors24h: number; expiredInvitations: number; inactiveOrganizations30d: number; trialsEndingSoon: number; deactivatedOrganizations: number }
}

export interface OrganizationRow {
  id: string
  name: string
  slug: string
  active: boolean
  createdAt: string
  country: string | null
  city: string | null
  sector: string | null
  category: string | null
  taxId: string | null
  plan: { key: string | null; name: string | null; status: string | null; trialEndsAt: string | null }
  admin: { id: string | null; name: string | null; email: string | null; activated: boolean }
  accounts: number
  users: number
  pendingUsers: number
  lastActivityAt: string | null
  featuresOffered: string[]
  aiFeatures: string[]
  aiRuns30d: number
}

export interface OrganizationDetail extends OrganizationRow {
  accountList: { id: string; name: string; slug: string; active: boolean; createdAt: string; iconKey: string | null }[]
  userList: {
    id: string
    name: string
    email: string | null
    status: 'active' | 'pending'
    isOrganizationAdmin: boolean
    activeProfile: boolean
    createdAt: string
    lastSignInAt: string | null
    roles: string[]
  }[]
  invitation: { createdAt: string; expiresAt: string; usedAt: string | null; revokedAt: string | null } | null
  configuration: { key: string; label: string; category: string; available: boolean; includedInPlan: boolean; settings: Record<string, unknown>; accountsEnabled: number }[]
  activity: ActivityItem[]
}

export interface UserRow {
  id: string
  name: string
  email: string | null
  createdAt: string
  avatarKey: string | null
  status: 'active' | 'pending' | 'disabled'
  globalAdmin: boolean
  lastSignInAt: string | null
  organizations: { id: string; name: string; isOrganizationAdmin: boolean; status: string }[]
  roles: string[]
  aiFeaturesUsed: string[]
  aiRuns30d: number
}

export interface UserDetail extends UserRow {
  accounts: { name: string; organization: string; active: boolean; role: string | null }[]
  activity: ActivityItem[]
}

export interface AiFeatureStats {
  key: string
  label: string
  category: 'ai' | 'voice'
  usesModel: boolean
  platformActive: boolean
  tracked: boolean
  organizationsOffering: number
  accountsEnabled: number
  runs: number
  errors: number
  users: number
  organizationsUsing: number
  avgLatencyMs: number | null
  tokens: number
  lastRunAt: string | null
}

export interface AiMonitoring {
  range: { from: string; to: string }
  features: AiFeatureStats[]
  daily: DailyPoint[]
  byOrganization: { id: string; name: string; runs: number; errors: number; users: number; features: string[] }[]
  recent: { at: string; feature: string; status: 'ok' | 'empty' | 'error'; account: string; organization: string; user: string | null; latencyMs: number | null }[]
}

export interface ActivityFilters {
  from?: string | null
  to?: string | null
  organizationId?: string | null
  userId?: string | null
  category?: string | null
  search?: string | null
  limit?: number
  offset?: number
}

export const fetchOverview = (from: string, to: string) => rpc<Overview>('dk_ga_overview', { p_from: from, p_to: to })
export const fetchOrganizations = () => rpc<OrganizationRow[]>('dk_ga_organizations')
export const fetchOrganization = (id: string) => rpc<OrganizationDetail>('dk_ga_organization_detail', { p_organization_id: id })
export const fetchUsers = () => rpc<UserRow[]>('dk_ga_users')
export const fetchUser = (id: string) => rpc<UserDetail>('dk_ga_user_detail', { p_user_id: id })
export const fetchAiMonitoring = (from: string, to: string) => rpc<AiMonitoring>('dk_ga_ai_monitoring', { p_from: from, p_to: to })
export const fetchActivity = (f: ActivityFilters) =>
  rpc<{ categories: string[]; items: ActivityItem[] }>('dk_ga_activity', {
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_organization_id: f.organizationId ?? null,
    p_user_id: f.userId ?? null,
    p_category: f.category ?? null,
    p_search: f.search?.trim() || null,
    p_limit: f.limit ?? 50,
    p_offset: f.offset ?? 0,
  })

export interface NewOrganizationCheck {
  emailValid: boolean
  user: { exists: boolean; hasLogin: boolean; fullName: string | null; active: boolean; ownsOrganization: string | null }
  similarOrganizations: { id: string; name: string; slug: string; taxId: string | null; active: boolean }[]
}

export const checkNewOrganization = (name: string, email: string, taxId?: string | null) =>
  rpc<NewOrganizationCheck>('dk_ga_check_new_organization', { p_name: name, p_email: email, p_tax_id: taxId || null })

export const setOrganizationActive = (id: string, active: boolean, confirmName: string) =>
  rpc<void>('dk_ga_set_organization_active', { p_organization_id: id, p_active: active, p_confirm_name: confirmName })

export interface NewOrganizationInput {
  name: string
  sector: string
  category: string
  adminName: string
  adminEmail: string
  plan: string
  country: string
  city?: string | null
  phone?: string | null
  taxId?: string | null
  confirmSimilar?: boolean
}

export interface InvitationResult {
  sent: boolean
  detail: string | null
  method: 'invite' | 'sign_in_link'
  /** Only when the e-mail could not be sent: to copy and share by hand. */
  activationUrl: string | null
}

export interface CreatedOrganization {
  organizationId: string
  organizationSlug: string
  accountSlug: string
  adminProfileId: string
  adminEmail: string
  adminName: string
  adminHasLogin: boolean
  plan: string
  status: string
  createdAt: string
  invitation: InvitationResult
}

/** Through the Edge Function, which also sends the invitation e-mail. */
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('dk-global-admin', { body })
  if (error) {
    // The function answers { error } with the database message.
    const context = (error as { context?: Response }).context
    const payload = context ? await context.json().catch(() => null) : null
    throw new Error(payload?.error ?? error.message)
  }
  return data as T
}

export const createOrganization = (input: NewOrganizationInput) => invoke<CreatedOrganization>({ action: 'create_organization', payload: input })
export const resendInvitation = (organizationId: string) =>
  invoke<{ organizationId: string; adminEmail: string; invitation: InvitationResult }>({ action: 'resend_invitation', organizationId })

export interface PlanOption {
  key: string
  name: string
  status: string
  trialDays: number
}

export async function fetchPlans(): Promise<PlanOption[]> {
  const { data, error } = await supabase.from('dk_plans').select('key, name, status, trial_days, sort_order').neq('status', 'retired').order('sort_order')
  if (error) throw error
  return (data ?? []).map((p) => ({ key: p.key, name: p.name, status: p.status, trialDays: p.trial_days }))
}

export interface PasswordLink {
  email: string
  name: string
  /** activation: never activated (opens /activar); reset: already has a login (opens /set-password). */
  mode: 'activation' | 'reset'
  link: string
}

/** One-time link for the person to create their own password; nothing is e-mailed. */
export const createPasswordLink = (userId: string) => invoke<PasswordLink>({ action: 'password_link', userId })
