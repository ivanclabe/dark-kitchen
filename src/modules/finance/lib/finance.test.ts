import { describe, expect, it } from 'vitest'
import type { Pnl } from '../types'
import { coverageNotes, daysUntil, formatPeso, statementRows } from './finance'

// ADR 0051: the statement the person reads, line by line (the same case as supabase/tests/finance.sql).
const pnl: Pnl = {
  from: '2026-10-05',
  to: '2026-10-11',
  orders: 1,
  grossSales: 40000,
  discounts: 4000,
  netSales: 36000,
  deliveryIncome: 5000,
  cogs: 3000,
  estimatedCogs: 0,
  grossProfit: 33000,
  grossMargin: 0.9167,
  waste: 500,
  adjustments: 1000,
  purchaseVat: 3800,
  purchaseVatDeductible: false,
  payroll: 75000,
  expenses: 750000,
  expensesByCategory: [
    { categoryId: 'c1', category: 'Arriendo', amount: 700000 },
    { categoryId: 'c2', category: 'Gas', amount: 50000 },
  ],
  operatingProfit: -792300,
  operatingMargin: -19.3244,
  coverage: { costCoverage: 1, uncostedSales: 0, unvaluedAdjustments: 0, membersWithoutPay: 0, noExpenses: false, noPayroll: false },
}

describe('statementRows', () => {
  it('goes from sales to operating profit, and the lines add up to it', () => {
    const rows = statementRows(pnl)
    expect(rows.map((r) => r.key)).toEqual(['grossSales', 'discounts', 'netSales', 'cogs', 'grossProfit', 'delivery', 'waste', 'adjustments', 'vat', 'payroll', 'expenses', 'operatingProfit'])
    const lines = rows.filter((r) => r.kind === 'line' && !['grossSales', 'discounts', 'cogs'].includes(r.key))
    expect(pnl.grossProfit + lines.reduce((s, r) => s + r.amount, 0)).toBe(pnl.operatingProfit)
    expect(rows.find((r) => r.key === 'expenses')?.children).toEqual([
      { key: 'c1', label: 'Arriendo', amount: -700000 },
      { key: 'c2', label: 'Gas', amount: -50000 },
    ])
  })

  it('without VAT as a cost (deductible) there is no VAT line', () => {
    expect(statementRows({ ...pnl, purchaseVatDeductible: true, purchaseVat: 0 }).some((r) => r.key === 'vat')).toBe(false)
  })

  it('says when part of the ingredients cost is estimated', () => {
    expect(statementRows({ ...pnl, estimatedCogs: 1200 }).find((r) => r.key === 'cogs')?.source).toMatch(/incluye \$1\.200 estimado/)
  })
})

describe('coverageNotes', () => {
  it('nothing missing, no notes', () => {
    expect(coverageNotes(pnl)).toEqual([])
  })

  it('tells what is missing for the profit to be complete', () => {
    const notes = coverageNotes({
      ...pnl,
      coverage: { costCoverage: 0.8, uncostedSales: 8000, unvaluedAdjustments: 2, membersWithoutPay: 1, noExpenses: true, noPayroll: true },
    })
    expect(notes).toEqual([
      '$8.000 en ventas de platos sin receta no tienen costo: la utilidad está sobreestimada.',
      '2 ajuste(s) de inventario de antes no tienen costo y no se cuentan.',
      '1 persona(s) trabajaron en el periodo sin pago configurado en Nómina.',
      'No hay nómina liquidada en el periodo.',
      'No hay gastos registrados en el periodo (arriendo, servicios…).',
    ])
  })
})

describe('helpers', () => {
  it('days until a due date and pesos', () => {
    expect(daysUntil('2026-10-11', '2026-10-11')).toBe(0)
    expect(daysUntil('2026-10-09', '2026-10-11')).toBe(-2)
    expect(daysUntil('2026-11-10', '2026-10-11')).toBe(30)
    expect(formatPeso(-792300)).toBe('-$792.300')
  })
})
