import { currentHost, docsUrl, type HostKind } from '@/shared/tenant/host'

/**
 * Where the help center lives (ADR 0035): doc.quanela.com, at its root. The
 * generated content keeps its paths as «/help/…» (one source for the app and
 * «Oye Quanela»); these two functions turn them into the right address.
 */
const PREFIX = '/help'

/** «/help/orders/x» → «/orders/x»; «/help» → «/». */
export function stripHelpPrefix(path: string): string {
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`) && !path.startsWith(`${PREFIX}#`) && !path.startsWith(`${PREFIX}?`)) return path
  const rest = path.slice(PREFIX.length)
  return rest.startsWith('/') ? rest : `/${rest}`
}

/** A page of the help center for its own router: without the prefix on doc.quanela.com. */
export function helpPath(path = PREFIX, host: HostKind = currentHost()): string {
  return host.kind === 'docs' ? stripHelpPrefix(path) : path
}

/**
 * A page of the help center from anywhere (the «?», menus, Copilot, the
 * landing): https://doc.quanela.com/…; without a root domain (previews,
 * development without configuring it) the app's own /help.
 */
export function helpHref(path = PREFIX, host: HostKind = currentHost()): string {
  if (host.kind === 'docs') return stripHelpPrefix(path)
  if (host.kind === 'path') return path
  return docsUrl(stripHelpPrefix(path)) ?? path
}
