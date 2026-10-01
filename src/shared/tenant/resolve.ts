import { supabase } from '@/shared/lib/supabase'
import type { MyAccountRow, MyContext, MyOrganization } from '@/shared/kitchen/kitchensApi'
import { currentHost, type HostKind } from './host'

/** What anyone may know about a subdomain (dk_tenant_public): nothing else is public. */
export interface TenantPublic {
  exists: boolean
  slug?: string
  name?: string | null
  active?: boolean | null
  /** The subdomain changed: go to this one. */
  redirectTo?: string | null
}

export async function fetchTenantPublic(slug: string): Promise<TenantPublic> {
  const { data, error } = await supabase.rpc('dk_tenant_public', { p_slug: slug })
  if (error) throw error
  return (data ?? { exists: false }) as unknown as TenantPublic
}

/**
 * resolveOrganizationFromHost (ADR 0021): the host → is it an organization?
 * → which one, and may anyone enter it? The membership is decided later,
 * with the session (tenantAccess).
 */
export async function resolveOrganizationFromHost(host: HostKind = currentHost()): Promise<{ host: HostKind; tenant: TenantPublic | null }> {
  if (host.kind !== 'tenant') return { host, tenant: null }
  return { host, tenant: await fetchTenantPublic(host.slug) }
}

export type TenantStatus = 'not_found' | 'redirect' | 'inactive' | 'signed_out' | 'no_access' | 'ready'

export interface TenantAccess {
  status: TenantStatus
  /** The person's membership in THIS organization (null without one). */
  membership: MyOrganization | null
  /** The accounts of this organization the person can open. */
  accounts: MyAccountRow[]
}

/**
 * The gate of a subdomain, as a pure decision: organization exists → active
 * → session → active membership → something to open. The database still
 * decides every request (RLS); this only chooses what to show.
 */
export function tenantAccess(tenant: TenantPublic, signedIn: boolean, ctx: MyContext | null | undefined): TenantAccess {
  const none = { membership: null, accounts: [] }
  if (!tenant.exists) return { status: 'not_found', ...none }
  if (tenant.redirectTo) return { status: 'redirect', ...none }
  if (tenant.active === false) return { status: 'inactive', ...none }
  if (!signedIn) return { status: 'signed_out', ...none }
  const membership = ctx?.organizations.find((o) => o.slug === tenant.slug) ?? null
  if (!membership || membership.status !== 'active') return { status: 'no_access', membership, accounts: [] }
  const accounts = (ctx?.accounts ?? []).filter((a) => a.organizationId === membership.id && (a.active || ctx?.profile.isPlatformAdmin))
  // Someone with no account can still be useful to the organization (its administration center).
  const canEnter = accounts.length > 0 || membership.isSuperAdmin || membership.permissions.length > 0
  return { status: canEnter ? 'ready' : 'no_access', membership, accounts }
}
