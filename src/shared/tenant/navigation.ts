import { currentHost, tenantRootDomain, tenantUrl } from './host'

/**
 * Where a page of the organization with code `orgCode` must live: on its own subdomain.
 * Returns the full URL to go to when THIS host is not that one (another
 * organization's subdomain, or the root domain); null when we are already
 * there, or in path mode (no root domain configured, previews).
 */
export function hostRedirectFor(orgCode: string | null | undefined, pathWithQuery: string): string | null {
  if (!orgCode || !tenantRootDomain()) return null
  const host = currentHost()
  if (host.kind === 'path') return null
  if (host.kind === 'tenant' && host.code === orgCode.toUpperCase()) return null
  return tenantUrl(orgCode, pathWithQuery)
}

/** Switching organization changes the host for real (not an id in memory). */
export function goToOrganization(orgCode: string, path = '/'): boolean {
  const url = tenantUrl(orgCode, path)
  if (!url) return false
  window.location.assign(url)
  return true
}
