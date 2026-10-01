/**
 * Which kind of host is this (ADR 0021)? The tenant is the subdomain:
 *   {slug}.{root}  → an organization
 *   {root}, www.{root} → the platform root (landing, sign-up, general login)
 *   anything else (Vercel previews, an IP, root domain not configured) →
 *   "path" mode: the app works by path as before, without a tenant.
 * The root domain comes from VITE_TENANT_ROOT_DOMAIN (quanela.com in
 * production, localhost in development); nothing is hard-coded.
 */
export type HostKind = { kind: 'root' } | { kind: 'tenant'; slug: string } | { kind: 'path' }

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function tenantRootDomain(): string {
  return (import.meta.env.VITE_TENANT_ROOT_DOMAIN ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '')
}

export function parseHost(hostname: string, root: string = tenantRootDomain()): HostKind {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!root) return { kind: 'path' }
  if (host === root || host === `www.${root}`) return { kind: 'root' }
  if (!host.endsWith(`.${root}`)) return { kind: 'path' }
  const label = host.slice(0, -(root.length + 1))
  // Only one level ({slug}.root); a.b.root is not a tenant.
  if (label.includes('.') || !SLUG.test(label) || label.length > 63) return { kind: 'path' }
  return { kind: 'tenant', slug: label }
}

export function currentHost(): HostKind {
  return typeof window === 'undefined' ? { kind: 'path' } : parseHost(window.location.hostname)
}

/** Port and protocol of this page, so links work the same in development (http, :5173) and production. */
function origin(host: string): string {
  if (typeof window === 'undefined') return `https://${host}`
  const { protocol, port } = window.location
  return `${protocol}//${host}${port ? `:${port}` : ''}`
}

/** https://{slug}.quanela.com{path} — or null without a root domain (path mode). */
export function tenantUrl(slug: string, path = '/'): string | null {
  const root = tenantRootDomain()
  return root ? `${origin(`${slug}.${root}`)}${path}` : null
}

/** https://quanela.com{path} — or null without a root domain. */
export function rootUrl(path = '/'): string | null {
  const root = tenantRootDomain()
  return root ? `${origin(root)}${path}` : null
}

/** "{slug}.quanela.com", to show. */
export function tenantHostLabel(slug: string): string {
  const root = tenantRootDomain()
  return root ? `${slug}.${root}` : slug
}

/**
 * The session can be shared by every subdomain only on a real domain:
 * browsers do not accept a cookie for ".localhost" (development logs in per
 * subdomain).
 */
export function sharedCookieDomain(root: string = tenantRootDomain()): string | null {
  if (!root || root === 'localhost' || !root.includes('.')) return null
  return `.${root}`
}
