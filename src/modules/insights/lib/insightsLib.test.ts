import { describe, expect, it } from 'vitest'
import type { InsightsData } from '../api'
import { toCsv } from './csv'
import { change, formatChange, formatPercent } from './format'
import { compareRange, presetRange, rangeLabel } from './periods'
import { businessSummary } from './summary'

// ADR 0027: periods, comparison, the rules of the business summary and the CSV.
describe('periods', () => {
  const today = '2026-10-05' // a Monday
  it.each([
    ['today', '2026-10-05', '2026-10-05', '2026-10-04', '2026-10-04'],
    ['week', '2026-10-05', '2026-10-05', '2026-09-28', '2026-09-28'],
    ['month', '2026-10-01', '2026-10-05', '2026-09-01', '2026-09-05'],
    ['lastMonth', '2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31'],
    ['quarter', '2026-10-01', '2026-10-05', '2026-07-01', '2026-07-05'],
    ['year', '2026-01-01', '2026-10-05', '2025-01-01', '2025-10-05'],
  ] as const)('%s: %s…%s vs %s…%s', (preset, from, to, cFrom, cTo) => {
    const range = presetRange(preset, today)
    expect(range).toEqual({ from, to })
    expect(compareRange(preset, range)).toEqual({ from: cFrom, to: cTo })
  })

  it('a month-to-date on the 31st compares with the last day of a shorter month', () => {
    expect(compareRange('month', { from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('custom: the same length right before', () => {
    expect(compareRange('custom', { from: '2026-09-10', to: '2026-09-19' })).toEqual({ from: '2026-08-31', to: '2026-09-09' })
  })

  it('labels', () => {
    expect(rangeLabel({ from: '2026-09-01', to: '2026-09-30' })).toBe('1–30 sep')
    expect(rangeLabel({ from: '2026-08-28', to: '2026-09-03' })).toBe('28 ago – 3 sep')
    expect(rangeLabel({ from: '2026-10-05', to: '2026-10-05' })).toBe('5 oct')
  })
})

describe('formats', () => {
  it('never "+∞ %": no previous value, no change', () => {
    expect(change(100, 0)).toBeNull()
    expect(change(100, null)).toBeNull()
    expect(formatChange(change(112.4, 100)!)).toBe('+12,4 %')
    expect(formatPercent(0.9048)).toBe('90,5 %')
  })
})

const base = (over: Partial<InsightsData> = {}): InsightsData => ({
  timezone: 'America/Bogota',
  currency: 'COP',
  profitability: true,
  period: { from: '2026-09-01', to: '2026-09-30' },
  compare: { from: '2026-08-01', to: '2026-08-31' },
  current: { revenue: 112400, netRevenue: 100000, orders: 20, units: 40, averageOrderValue: 5620, cogs: 43000, grossProfit: 57000, grossMargin: 0.57, estimatedCogs: 0, costCoverage: 1 },
  previous: { revenue: 100000, netRevenue: 90000, orders: 18, units: 35, averageOrderValue: 5555, cogs: 35100, grossProfit: 54900, grossMargin: 0.61, estimatedCogs: 0, costCoverage: 1 },
  daily: [],
  products: [],
  categories: [],
  channels: [],
  byWeekday: [],
  byHour: [],
  purchases: { total: 0, previousTotal: 0, bySupplier: [], ingredients: [] },
  waste: { total: 0, previousTotal: 0, byIngredient: [] },
  ...over,
})

describe('business summary (rules on real data, no AI)', () => {
  it('states the facts, the revenue change and the margin drop', () => {
    const texts = businessSummary(base(), 'ago').map((i) => i.text)
    expect(texts[0]).toBe('Vendiste $112.400 en 20 pedidos (ticket promedio $5.620).')
    expect(texts).toContain('Los ingresos subieron 12,4 % frente a ago.')
    expect(texts).toContain('El margen bruto bajó de 61 % a 57 %.')
  })

  it('best category, top product below the average margin, unit cost and ingredient price rises', () => {
    const data = base({
      categories: [
        { id: 'c1', name: 'Bebidas', units: 10, revenue: 20000, previousRevenue: null, cogs: 6000, grossProfit: 14000, grossMargin: 0.7 },
        { id: null, name: null, units: 30, revenue: 80000, previousRevenue: null, cogs: 37000, grossProfit: 43000, grossMargin: 0.54 },
      ],
      products: [
        { id: 'p1', name: 'Hamburguesa X', categoryId: null, categoryName: null, units: 20, revenue: 60000, previousRevenue: null, previousUnits: null, cogs: 37200, grossMargin: 0.38, unitCost: 1860, previousUnitCost: 1600, realUnits: 20, previousRealUnits: 15 },
        { id: 'p2', name: 'Limonada', categoryId: 'c1', categoryName: 'Bebidas', units: 10, revenue: 20000, previousRevenue: null, previousUnits: null, cogs: 6000, grossMargin: 0.7 },
      ],
      purchases: { total: 1, previousTotal: 1, bySupplier: [], ingredients: [{ id: 'i1', name: 'Pollo', unit: 'kg', quantity: 1, total: 11400, purchases: 1, averagePrice: 11400, previousAveragePrice: 10000, previousPurchases: 1 }] },
    })
    const texts = businessSummary(data, 'ago').map((i) => i.text)
    expect(texts).toContain('Bebidas tuvo el mayor margen bruto (70 %).')
    expect(texts).toContain('Hamburguesa X generó más ingresos, pero su margen (38 %) está por debajo del promedio (57 %).')
    expect(texts).toContain('El costo por unidad de Hamburguesa X subió 16,3 %.')
    expect(texts).toContain('Pollo se compró 14 % más caro (por kg).')
  })

  it('little data: only the facts (and the missing-cost warning)', () => {
    const data = base({ current: { ...base().current, orders: 3, costCoverage: 0.8 } })
    const items = businessSummary(data, 'ago')
    expect(items.map((i) => i.id)).toEqual(['facts', 'coverage'])
    expect(items[1].text).toBe('El 20 % de las ventas no tiene costo registrado: el margen puede estar sobreestimado.')
  })

  it('no sales: says so', () => {
    expect(businessSummary(base({ current: { ...base().current, orders: 0, revenue: 0 } }), null).map((i) => i.text)).toEqual(['No hay ventas en este periodo.'])
  })

  it('without the profitability permission there are no cost sentences', () => {
    const data = base({ profitability: false, current: { revenue: 112400, netRevenue: 100000, orders: 20, units: 40, averageOrderValue: 5620 }, previous: { revenue: 100000, netRevenue: 90000, orders: 18, units: 35, averageOrderValue: 5555 } })
    const ids = businessSummary(data, 'ago').map((i) => i.id)
    expect(ids).toEqual(['facts', 'revenue'])
  })
})

describe('CSV', () => {
  it('BOM, ";" separator, raw numbers and escaped text', () => {
    expect(toCsv(['Producto', 'Ingresos'], [['Sopa; grande', 16000.5], ['Dice "hola"', null]])).toBe('﻿Producto;Ingresos\r\n"Sopa; grande";16000.5\r\n"Dice ""hola""";')
  })
})
