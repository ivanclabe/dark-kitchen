/**
 * CSV for Excel in Spanish (ADR 0027): UTF-8 with BOM, ";" separator, raw
 * numbers (no thousands separator), quotes escaped. The only export of the app.
 */
export type CsvCell = string | number | null | undefined

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const cell = (v: CsvCell) => {
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : ''
    return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
}

export function downloadCsv(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
