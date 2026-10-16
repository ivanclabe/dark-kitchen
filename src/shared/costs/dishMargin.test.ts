import { describe, expect, it } from 'vitest'
import { dishMargin } from './dishMargin'

describe('dishMargin (ADR 0063 D6)', () => {
  it('is ok within the target', () => {
    expect(dishMargin(20000, 6000, 35)).toEqual({ status: 'ok', foodCostPct: 30, suggestedPrice: 17200 })
  })
  it('marks a dish above the target and proposes a price rounded up to 100', () => {
    expect(dishMargin(15000, 7000, 35)).toEqual({ status: 'above_target', foodCostPct: 46.7, suggestedPrice: 20000 })
  })
  it('marks a dish sold at or below its cost', () => {
    expect(dishMargin(5000, 5200, 35).status).toBe('below_cost')
  })
  it('says nothing without a cost', () => {
    expect(dishMargin(15000, 0, 35)).toEqual({ status: 'no_cost', foodCostPct: null, suggestedPrice: null })
  })
})
