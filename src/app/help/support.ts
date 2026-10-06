import { helpHref } from '@/shared/help/helpUrl'

/**
 * Ayuda y soporte (ADR 0023). Contacto y centro de ayuda vienen de variables
 * de entorno (D3, D4): sin ellas, la opción no aparece. Nada fijo en el código.
 */
export function supportEmail(): string | null {
  return (import.meta.env.VITE_SUPPORT_EMAIL ?? '').trim() || null
}

/** wa.me link for the support WhatsApp (digits only, with country code). */
export function supportWhatsAppUrl(): string | null {
  const digits = (import.meta.env.VITE_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '')
  return digits ? `https://wa.me/${digits}` : null
}

/** The public help center: doc.quanela.com (ADR 0035), unless VITE_HELP_URL points somewhere else. */
export function helpCenterUrl(): string {
  const url = (import.meta.env.VITE_HELP_URL ?? '').trim()
  return /^https:\/\//.test(url) ? url : helpHref()
}

/** Version of this build: the deploy's commit (Vercel) or "dev". */
export function appVersion(): string {
  return (import.meta.env.VITE_APP_VERSION ?? '').trim() || 'dev'
}

export interface DiagnosticsInput {
  userName: string | null
  email: string | null
  organization: { name: string; code: string } | null
  account: { name: string; slug: string } | null
  role: string | null
  permissionCount: number | null
  screen: string
  userAgent: string
  timeZone: string
  version: string
  signedInAt: string | null
  sessionExpiresAt: number | null
  now?: Date
}

/** Short browser label ("Chrome 128 · macOS") from the user agent. */
export function browserLabel(ua: string): string {
  const version = (re: RegExp) => re.exec(ua)?.[1]
  const edge = version(/Edg\/(\d+)/)
  const chrome = version(/Chrome\/(\d+)/)
  const firefox = version(/Firefox\/(\d+)/)
  const safari = version(/Version\/(\d+).*Safari/)
  const browser = edge ? `Edge ${edge}` : chrome ? `Chrome ${chrome}` : firefox ? `Firefox ${firefox}` : safari ? `Safari ${safari}` : 'Navegador'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} · ${os}` : browser
}

/**
 * Session details as label/value rows — for the "Detalles de la sesión"
 * window and the problem report. Only what support needs to locate the
 * person: never passwords, tokens, or customer data.
 */
export function diagnostics(input: DiagnosticsInput): [string, string][] {
  const fmt = (d: Date) => d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
  const rows: [string, string][] = [
    ['Usuario', [input.userName, input.email].filter(Boolean).join(' · ') || '—'],
    ['Código', input.organization ? `${input.organization.code} · ${input.organization.name}` : '—'],
    ['Cuenta', input.account ? `${input.account.name} (${input.account.slug})` : '—'],
    ['Rol activo', input.role ?? '—'],
    ['Permisos', input.permissionCount != null ? String(input.permissionCount) : '—'],
    ['Pantalla', input.screen],
    ['Inicio de sesión', input.signedInAt ? fmt(new Date(input.signedInAt)) : '—'],
    ['Sesión vence', input.sessionExpiresAt ? fmt(new Date(input.sessionExpiresAt * 1000)) : '—'],
    ['Dispositivo', browserLabel(input.userAgent)],
    ['Zona horaria', input.timeZone],
    ['Versión', input.version],
    ['Fecha', fmt(input.now ?? new Date())],
  ]
  return rows
}

export function diagnosticsText(rows: [string, string][]): string {
  return rows.map(([k, v]) => `${k}: ${v}`).join('\n')
}

/** mailto: for "Reportar un problema" — the person's words plus the diagnostics. */
export function reportMailto(email: string, description: string, rows: [string, string][]): string {
  const subject = `Problema en Quanela${rows.find(([k]) => k === 'Código')?.[1] ? ` · ${rows.find(([k]) => k === 'Código')![1]}` : ''}`
  const body = `${description.trim()}\n\n— Datos para soporte —\n${diagnosticsText(rows)}`
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
