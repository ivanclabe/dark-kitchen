import { describe, expect, it } from 'vitest'
import type { MenuPlanItem } from '../types'
import { isDayBlocked } from './dragRules'

const items = [{ productId: 'p1' }, { productId: 'p2' }] as MenuPlanItem[]

describe('days refuse duplicates while dragging (ADR 0018)', () => {
  it('a day that already has the dish is blocked', () => {
    expect(isDayBlocked('2026-10-05', items, { productId: 'p1', sourceDate: null })).toBe(true)
  })
  it('a day without it accepts it', () => {
    expect(isDayBlocked('2026-10-05', items, { productId: 'p3', sourceDate: null })).toBe(false)
  })
  it('the day a dish is dragged from is not blocked (reordering)', () => {
    expect(isDayBlocked('2026-10-05', items, { productId: 'p1', sourceDate: '2026-10-05' })).toBe(false)
  })
  it('nothing dragged: nothing blocked', () => {
    expect(isDayBlocked('2026-10-05', items, { productId: null, sourceDate: null })).toBe(false)
    expect(isDayBlocked('2026-10-05', items, undefined)).toBe(false)
  })
})
