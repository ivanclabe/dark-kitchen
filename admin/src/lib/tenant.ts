/**
 * The address of each organization in Quanela (ADR 0022): {code}.{root},
 * with the 6-character code in lowercase (a7k92p.quanela.com).
 * The root comes from VITE_TENANT_ROOT_DOMAIN (quanela.com in production,
 * localhost in development, where Quanela runs on port 5173).
 */
const root = (import.meta.env.VITE_TENANT_ROOT_DOMAIN ?? '').trim().toLowerCase()

export function tenantHost(code: string): string {
  return root ? `${code.toLowerCase()}.${root}` : code
}

export function tenantUrl(code: string): string | null {
  if (!root) return null
  const label = code.toLowerCase()
  return root === 'localhost' ? `http://${label}.localhost:5173` : `https://${label}.${root}`
}
