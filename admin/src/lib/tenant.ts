/**
 * The address of each organization in Quanela (ADR 0021): {slug}.{root}.
 * The root comes from VITE_TENANT_ROOT_DOMAIN (quanela.com in production,
 * localhost in development, where Quanela runs on port 5173).
 */
const root = (import.meta.env.VITE_TENANT_ROOT_DOMAIN ?? '').trim().toLowerCase()

export function tenantHost(slug: string): string {
  return root ? `${slug}.${root}` : slug
}

export function tenantUrl(slug: string): string | null {
  if (!root) return null
  return root === 'localhost' ? `http://${slug}.localhost:5173` : `https://${slug}.${root}`
}
