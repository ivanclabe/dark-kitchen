import { describe, expect, it } from 'vitest'
import { priceChanges, priceChangeText } from './priceChange'

describe('priceChanges (ADR 0063 D4)', () => {
  it('warns against the last purchase beyond the tolerance', () => {
    const c = priceChanges(118, { lastPerBase: 100, avg90PerBase: 100, avgCost: 100 }, 10)
    expect(c.map(priceChangeText)).toEqual(['Sube 18 % frente a la última compra'])
  })

  it('stays quiet within the tolerance', () => {
    expect(priceChanges(108, { lastPerBase: 100, avg90PerBase: 102, avgCost: 90 }, 10)).toEqual([])
  })

  it('adds the 90-day average when it says something else', () => {
    const c = priceChanges(80, { lastPerBase: 100, avg90PerBase: 60, avgCost: 70 }, 10)
    expect(c.map(priceChangeText)).toEqual(['Baja 20 % frente a la última compra', 'Sube 33 % frente al promedio de 90 días'])
  })

  it('falls back to the average cost on a first purchase and says «veces» for big jumps', () => {
    const c = priceChanges(40, { lastPerBase: null, avg90PerBase: null, avgCost: 4 }, 10)
    expect(c.map(priceChangeText)).toEqual(['Cuesta 10 veces más que el costo promedio'])
  })

  it('ignores a price of zero or no tolerance', () => {
    expect(priceChanges(0, { lastPerBase: 100, avg90PerBase: null, avgCost: null }, 10)).toEqual([])
    expect(priceChanges(150, { lastPerBase: 100, avg90PerBase: null, avgCost: null }, 0)).toEqual([])
  })
})
