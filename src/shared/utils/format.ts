/**
 * Formateadores únicos de la app. Antes había 4 copias de money() con dos
 * formatos incompatibles ($25.000 vs $25000.00) y 5 de todayStr().
 * Moneda: pesos colombianos (ADR 0039): «$25.000», separador de miles «.»,
 * decimales con «,», negativos «-$5.000».
 */
export interface MoneyFormat {
  /**
   * 0 (default): whole pesos. 'auto': up to 2 decimals when the amount has them
   * (a cost per gram, $3,25); a whole amount stays whole.
   */
  decimals?: 0 | 'auto'
  /** «$25.000 COP»: where the currency must be explicit (totals, payments, billing). */
  code?: boolean
}

export function formatMoney(n: number, { decimals = 0, code = false }: MoneyFormat = {}): string {
  const value = Number.isFinite(n) ? n : 0
  const digits = decimals === 'auto' && !Number.isInteger(Math.round(value * 100) / 100) ? 2 : 0
  const body = Math.abs(value).toLocaleString('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const sign = value < 0 && body.replace(/[0.,]/g, '') !== '' ? '-' : ''
  return `${sign}$${body}${code ? ' COP' : ''}`
}

/** «$1,2 M», «$850 mil», «$900»: short amounts for chart axes. */
export function formatMoneyCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000).toLocaleString('es-CO')} mil`
  return formatMoney(n)
}

/** "17/9/2026, 3:35 p. m." — para timestamps en tablas y detalles. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** "17/9/2026" — para fechas sin hora (vencimientos, días). Acepta ISO o "YYYY-MM-DD". */
export function formatDate(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return d.toLocaleDateString('es-CO')
}

/** "Miércoles, 16 de septiembre" — para encabezados humanos. */
export function formatDateLong(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso)
  const label = d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** "YYYY-MM-DD" en horario local — el formato que produce/espera un <input type="date">. */
export function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string {
  return toDateInput(new Date())
}

export function initials(name: string | undefined | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}
