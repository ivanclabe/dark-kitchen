/**
 * Which kind of host is this (ADR 0021/0022)? The tenant is the subdomain,
 * the organization's 6-character code (never its name):
 *   {code}.{root}  → an organization (a7k92p.quanela.com → A7K92P)
 *   {root}, www.{root} → the platform root (landing, sign-up, general login)
 *   anything else (Vercel previews, an IP, root domain not configured) →
 *   "path" mode: the app works by path as before, without a tenant.
 * The root domain comes from VITE_TENANT_ROOT_DOMAIN (quanela.com in
 * production, localhost in development); nothing is hard-coded.
 */
export type HostKind = { kind: 'root' } | { kind: 'tenant'; code: string } | { kind: 'path' }

/** Any DNS label; whether it is a real organization code is decided by the database (dk_tenant_public). */
const LABEL = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function tenantRootDomain(): string {
  return (import.meta.env.VITE_TENANT_ROOT_DOMAIN ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '')
}

export function parseHost(hostname: string, root: string = tenantRootDomain()): HostKind {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!root) return { kind: 'path' }
  if (host === root || host === `www.${root}`) return { kind: 'root' }
  if (!host.endsWith(`.${root}`)) return { kind: 'path' }
  const label = host.slice(0, -(root.length + 1))
  // Only one level ({code}.root); a.b.root is not a tenant.
  if (label.includes('.') || !LABEL.test(label) || label.length > 63) return { kind: 'path' }
  // Codes are shown in uppercase (A7K92P); DNS is case-insensitive.
  return { kind: 'tenant', code: label.toUpperCase() }
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

/** https://{code}.quanela.com{path} (lowercase host) — or null without a root domain (path mode). */
export function tenantUrl(code: string, path = '/'): string | null {
  const root = tenantRootDomain()
  return root ? `${origin(`${code.toLowerCase()}.${root}`)}${path}` : null
}

/** https://quanela.com{path} — or null without a root domain. */
export function rootUrl(path = '/'): string | null {
  const root = tenantRootDomain()
  return root ? `${origin(root)}${path}` : null
}

/** "a7k92p.quanela.com", to show. */
export function tenantHostLabel(code: string): string {
  const root = tenantRootDomain()
  return root ? `${code.toLowerCase()}.${root}` : code
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
