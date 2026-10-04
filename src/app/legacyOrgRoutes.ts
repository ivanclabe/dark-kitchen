/**
 * ADR 0024: the organization's administration center (/o/{slug}/…, ADR 0012)
 * no longer exists. Each old address goes to its equivalent inside an
 * account; null = "Tus cuentas".
 */
const ORG_SECTION_IN_ACCOUNT: Record<string, string | null> = {
  '': '/',
  cuentas: null,
  equipos: '/users',
  facturacion: '/settings/billing',
  ai: '/settings/ai',
  configuracion: '/settings/general',
  observabilidad: '/settings/activity',
  'menus-maestros': '/menu-planner?view=shared',
}

/** `rest` = what followed /o/{slug}/ ("equipos", "ai?tab=uso"…). */
export function accountPathForOrgSection(rest: string): string | null {
  const section = rest.split(/[/?#]/)[0] ?? ''
  return section in ORG_SECTION_IN_ACCOUNT ? ORG_SECTION_IN_ACCOUNT[section] : '/'
}
