/** Labels of the dimensions Insights groups by. */
export const CHANNEL_LABEL: Record<string, string> = { MANUAL: 'En la app', WHATSAPP: 'WhatsApp', PHONE: 'Teléfono' }
export const WEEKDAY_LABEL = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "2026-09-05" → "5 sep" (chart axes). */
export function dayLabel(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`
}

export const NO_CATEGORY = 'Sin categoría'
