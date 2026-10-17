import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../types'
import { isLowStock } from './stock'

const ing = (stockAvailable: number, minStock: number) => ({ stockAvailable, minStock }) as Ingredient

describe('isLowStock (ADR 0065)', () => {
  it('at or under the minimum is low', () => {
    expect(isLowStock(ing(2, 5))).toBe(true)
    expect(isLowStock(ing(5, 5))).toBe(true)
    expect(isLowStock(ing(6, 5))).toBe(false)
  })

  it('without a minimum there is no threshold to break (it used to flag every empty item)', () => {
    expect(isLowStock(ing(0, 0))).toBe(false)
  })
})
