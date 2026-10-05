const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * "Hoy", "Ayer", "Hace 3 días", "5 sep" or "5 sep 2025", in the device's
 * time zone (the last order, the registration date).
 */
export function relativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())
  const days = Math.round((day(now) - day(d)) / 86_400_000)
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 7) return `Hace ${days} días`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`}`
}
