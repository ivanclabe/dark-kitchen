/**
 * Formateadores únicos de la app. Antes había 4 copias de money() con dos
 * formatos incompatibles ($25.000 vs $25000.00) y 5 de todayStr().
 * Moneda: pesos colombianos, sin decimales, separador de miles "." (es-CO).
 */
export function formatMoney(n: number): string {
  return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
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
