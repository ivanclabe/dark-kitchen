/**
 * ADR 0051 — Finanzas, pure: the profit-and-loss statement as rows (each one
 * says where it comes from), what is missing for it to be complete, and the
 * labels of obligations and payments.
 */
import type { ObligationKind, ObligationStatus, Pnl } from '../types'

export const KIND_LABEL: Record<ObligationKind, string> = {
  purchase: 'Proveedor',
  expense: 'Gasto',
  payroll: 'Nómina',
}

export const STATUS_LABEL: Record<ObligationStatus, string> = {
  pending: 'Pendiente',
  partial: 'Abonada',
  overdue: 'Vencida',
  paid: 'Pagada',
  voided: 'Anulada',
}

export const STATUS_TONE: Record<ObligationStatus, 'neutral' | 'info' | 'danger' | 'success' | 'warning'> = {
  pending: 'neutral',
  partial: 'info',
  overdue: 'danger',
  paid: 'success',
  voided: 'neutral',
}

export interface StatementRow {
  key: string
  label: string
  /** Positive adds, negative subtracts; totals are shown as they are. */
  amount: number
  kind: 'line' | 'subtotal' | 'total'
  /** Where the number comes from (shown under it). */
  source?: string
  /** For margin rows. */
  margin?: number | null
  children?: { key: string; label: string; amount: number }[]
}

/** The statement, top to bottom: sales, cost of the ingredients sold, gross profit, losses and expenses, operating profit. */
export function statementRows(p: Pnl): StatementRow[] {
  const rows: StatementRow[] = [
    { key: 'grossSales', label: 'Ventas', amount: p.grossSales, kind: 'line', source: `${p.orders} pedido(s) confirmado(s); los que no se confirmaron no cuentan` },
    { key: 'discounts', label: 'Descuentos', amount: -p.discounts, kind: 'line' },
    { key: 'netSales', label: 'Ventas netas', amount: p.netSales, kind: 'subtotal' },
    {
      key: 'cogs',
      label: 'Costo de los ingredientes vendidos',
      amount: -p.cogs,
      kind: 'line',
      source:
        p.estimatedCogs > 0
          ? `Lo que salió del inventario al costo promedio; incluye ${formatPeso(p.estimatedCogs)} estimado con la receta (platos aún sin preparar)`
          : 'Lo que salió del inventario al costo promedio',
    },
    { key: 'grossProfit', label: 'Utilidad bruta', amount: p.grossProfit, kind: 'subtotal', margin: p.grossMargin },
    { key: 'delivery', label: 'Domicilios cobrados', amount: p.deliveryIncome, kind: 'line', source: 'Lo que pagaron los clientes por el domicilio' },
    { key: 'waste', label: 'Mermas', amount: -p.waste, kind: 'line', source: 'Cantidad perdida × costo promedio' },
    {
      key: 'adjustments',
      label: 'Ajustes de inventario',
      amount: -p.adjustments,
      kind: 'line',
      source: p.adjustments < 0 ? 'Sobró inventario en los conteos' : 'Faltó inventario en los conteos',
    },
  ]
  if (!p.purchaseVatDeductible) {
    rows.push({ key: 'vat', label: 'IVA de compras', amount: -p.purchaseVat, kind: 'line', source: 'No lo descuentas: es un costo (puedes cambiarlo abajo)' })
  }
  rows.push(
    { key: 'payroll', label: 'Nómina', amount: -p.payroll, kind: 'line', source: 'Nóminas liquidadas, repartidas por los días del periodo' },
    {
      key: 'expenses',
      label: 'Gastos',
      amount: -p.expenses,
      kind: 'line',
      source: 'En la fecha o el periodo de cada gasto, no cuando se paga',
      children: p.expensesByCategory.map((c) => ({ key: c.categoryId, label: c.category, amount: -c.amount })),
    },
    { key: 'operatingProfit', label: 'Utilidad operativa', amount: p.operatingProfit, kind: 'total', margin: p.operatingMargin },
  )
  return rows
}

/** What the statement still lacks to be the whole truth. */
export function coverageNotes(p: Pnl): string[] {
  const notes: string[] = []
  const c = p.coverage
  if (c.costCoverage !== null && c.costCoverage < 1) {
    notes.push(`${formatPeso(c.uncostedSales)} en ventas de platos sin receta no tienen costo: la utilidad está sobreestimada.`)
  }
  if (c.unvaluedAdjustments > 0) notes.push(`${c.unvaluedAdjustments} ajuste(s) de inventario de antes no tienen costo y no se cuentan.`)
  if (c.membersWithoutPay > 0) notes.push(`${c.membersWithoutPay} persona(s) trabajaron en el periodo sin pago configurado en Nómina.`)
  if (c.noPayroll) notes.push('No hay nómina liquidada en el periodo.')
  if (c.noExpenses) notes.push('No hay gastos registrados en el periodo (arriendo, servicios…).')
  return notes
}

/** «$1.250.000» — kept here so the pure functions do not depend on the UI formatters. */
export function formatPeso(n: number): string {
  const v = Math.round(n)
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('es-CO')}`
}

/** «del 1 al 15 de oct.»-like ranges are left to the UI; this one tells whether a due date passed. */
export function daysUntil(due: string, today: string): number {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}
