/**
 * Public address of Quanela for links that travel by e-mail (confirmation,
 * activation): VITE_SITE_URL (https://quanela.com in production), so a sign-up
 * made from a preview or from localhost never sends a link to localhost.
 * Without it, the current origin.
 */
export function appUrl(path = ''): string {
  const base = (import.meta.env.VITE_SITE_URL ?? '').trim().replace(/\/+$/, '') || window.location.origin
  return `${base}${path}`
}
