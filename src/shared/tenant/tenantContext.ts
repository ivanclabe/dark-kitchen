import type { MyAccountRow, MyOrganization } from '@/shared/kitchen/kitchensApi'
import { createContext, use } from 'react'
import type { HostKind } from './host'
import type { TenantPublic, TenantStatus } from './resolve'

/**
 * The tenant of this page (ADR 0021), resolved ONCE from the host by
 * TenantProvider. Every module asks here instead of deciding by itself:
 *   - mode 'tenant': {slug}.quanela.com — the organization, the person's
 *     membership in it and its accounts;
 *   - mode 'root': quanela.com — no organization (landing, sign-up, list);
 *   - mode 'path': other hosts (previews) — the app works by path as before.
 */
export interface TenantValue {
  host: HostKind
  mode: HostKind['kind']
  /** The subdomain (only in 'tenant' mode). */
  slug: string | null
  status: TenantStatus | 'loading' | 'error' | 'none'
  tenant: TenantPublic | null
  organization: { id: string | null; slug: string; name: string } | null
  membership: MyOrganization | null
  accounts: MyAccountRow[]
  retry: () => void
}

export const TenantContext = createContext<TenantValue | null>(null)

export function useTenant(): TenantValue {
  const value = use(TenantContext)
  if (!value) throw new Error('useTenant must be used inside TenantProvider')
  return value
}
