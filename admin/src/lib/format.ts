/** Small formatting helpers for the portal (Spanish, Colombia). */
const nf = new Intl.NumberFormat('es-CO')

export const formatNumber = (n: number | null | undefined) => (n == null ? '—' : nf.format(n))

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** "hace 3 h", "hace 2 d", "nunca". */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'Nunca'
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'Hace un momento'
  const m = Math.round(s / 60)
  if (m < 60) return `Hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `Hace ${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return `Hace ${d} ${d === 1 ? 'día' : 'días'}`
  const mo = Math.round(d / 30)
  return `Hace ${mo} ${mo === 1 ? 'mes' : 'meses'}`
}

export type RangeKey = '7d' | '30d' | '90d'
export const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 }

/** [from, to) for the last N days, as ISO strings. */
export function rangeFor(key: RangeKey, now = new Date()): { from: string; to: string } {
  const to = new Date(now)
  const from = new Date(now)
  from.setDate(from.getDate() - RANGE_DAYS[key] + 1)
  from.setHours(0, 0, 0, 0)
  return { from: from.toISOString(), to: to.toISOString() }
}

/** Activity categories of dk_audit_log, in plain words. */
export const CATEGORY_LABEL: Record<string, string> = {
  auth: 'Sesiones',
  user: 'Usuarios',
  role: 'Roles',
  order: 'Pedidos',
  catalog: 'Catálogo',
  purchase: 'Compras',
  feature: 'Funciones',
  ai: 'IA',
  voice: 'Voz',
  account: 'Cuentas',
  account_access: 'Accesos',
  plan: 'Planes',
  platform: 'Plataforma',
  profile: 'Perfil',
  global_admin: 'Global Admin',
  organization: 'Organizaciones',
  record: 'Registros',
}

export const categoryLabel = (c: string | null | undefined) => (c ? (CATEGORY_LABEL[c] ?? c) : '—')
